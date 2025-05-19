// Core Node.js and external dependencies
import { ArgumentsCamelCase, Argv } from "yargs";
import { existsSync, readFileSync, unlinkSync } from "fs";
import { join, isAbsolute, basename, dirname } from "path";
import * as process from "node:process";
import { get } from "https";
import { createWriteStream, mkdtempSync } from "fs";
import { tmpdir } from "os";
import { URL } from "url";

// Internal dependencies
import { logger } from "../logger";
import { bold, green, red } from "picocolors";
import {
  createDefaultTaskRegistry,
  TaskRunner,
  WorkflowConfig,
  TaskContext,
  Task,
} from "../tasks";

/**
 * Command line arguments for the workflow command
 */
interface WorkflowArgv {
  file: string; // Path or URL to the workflow file
  keep?: boolean; // Flag to keep temporary files after execution
}

// Command configuration
export const command = "workflow <file> [options]";
export const describe = "Run a workflow from a JSON file or URL";
export const aliases = ["w"]; // Command alias

/**
 * Step 1: Check if a string is a valid URL
 */
const isUrl = (str: string): boolean => {
  try {
    const { protocol } = new URL(str);
    return protocol === "https:";
  } catch {
    return false;
  }
};

/**
 * Step 2: Download a file from a URL to a local path
 *
 * Step 2.1: Create a write stream to save the file
 * Step 2.2: Pipe the HTTP response to the file
 * Step 2.3: Clean up on error by removing the partial download
 */
const downloadFile = (url: string, dest: string): Promise<void> => {
  return new Promise((resolve, reject) => {
    const file = createWriteStream(dest);
    get(url, response => {
      response.pipe(file);
      file.on("finish", () => {
        file.close();
        resolve();
      });
    }).on("error", err => {
      unlinkSync(dest);
      reject(err);
    });
  });
};

/**
 * Step 3: Fetch a workflow file from a URL or return the local path
 *
 * Step 3.1: If the source is not a URL, return it as is
 * Step 3.2: For URLs, create a temporary file path
 * Step 3.3: Download the file and return the temporary path
 */
const fetchWorkflow = async (source: string): Promise<string> => {
  if (!isUrl(source)) {
    return source;
  }

  const tempDir = mkdtempSync(join(tmpdir(), "opencode-workflow-"));
  const tempFile = join(tempDir, `workflow-${Date.now()}.json`);

  try {
    logger.info(`Downloading workflow from ${source}`);
    await downloadFile(source, tempFile);
    return tempFile;
  } catch (error) {
    logger.error(`Failed to download workflow: ${(error as Error).message}`);
    throw error;
  }
};

/**
 * Step 4: Configure the command line interface
 *
 * Step 4.1: Define the required 'file' positional argument
 * Step 4.2: Add the 'keep' option for temporary files
 * Step 4.3: Process the file path/URL
 *   - If it's a URL, keep it as is
 *   - If it's an absolute path, use it directly
 *   - If it's a relative path, resolve it against the current working directory
 */
export function builder(yargs: Argv<WorkflowArgv>): Argv {
  return yargs
    .positional("file", {
      type: "string",
      description: "path to workflow JSON file or URL",
      demandOption: true,
    })
    .option("keep", {
      type: "boolean",
      description: "keep temporary files after execution",
      default: false,
    })
    .coerce("file", (value: string) => {
      if (isUrl(value)) {
        return value;
      }
      if (isAbsolute(value)) {
        return value;
      }
      return join(process.cwd(), value);
    });
}

/**
 * Step 5: WorkflowTask class that implements the Task interface
 * Handles the execution of a workflow file, including sub-workflows
 */
class WorkflowTask implements Task {
  /**
   * Step 5.1: Initialize with workflow file path and cleanup options
   */
  constructor(
    private workflowFile: string, // Path or URL to the workflow file
    private keepTemp: boolean = false, // Whether to keep temporary files
    private parentWorkflowPath?: string // Path to the parent workflow file (for relative resolution)
  ) {}

  /**
   * Step 5.2: Main execution method for the workflow
   */
  async execute(context: TaskContext): Promise<void> {
    let localWorkflowFile = this.workflowFile;
    let isTempFile = false;

    // If the path is relative and we have a parent workflow path, resolve it relative to the parent
    if (
      !isAbsolute(localWorkflowFile) &&
      !isUrl(localWorkflowFile) &&
      this.parentWorkflowPath
    ) {
      localWorkflowFile = join(
        dirname(this.parentWorkflowPath),
        localWorkflowFile
      );
    }

    try {
      // Step 5.2.1: Handle remote workflow files
      if (isUrl(localWorkflowFile)) {
        isTempFile = true;
        localWorkflowFile = await fetchWorkflow(localWorkflowFile);
      }

      // Step 5.2.2: Verify the workflow file exists
      if (!existsSync(localWorkflowFile)) {
        throw new Error(`Workflow file not found: ${localWorkflowFile}`);
      }

      // Step 5.2.3: Read and parse the workflow file
      const fileContent = readFileSync(localWorkflowFile, "utf-8");
      const config: WorkflowConfig = JSON.parse(fileContent);

      // Step 5.2.4: Validate the workflow structure
      if (!config.workflow || !Array.isArray(config.workflow)) {
        throw new Error("Invalid workflow file: workflow array not found");
      }

      // Step 5.2.5: Use the provided task registry or create a new one
      const taskRegistry = context.taskRegistry || createDefaultTaskRegistry();

      // Step 5.2.6: Register the workflow task type to support nested workflows
      taskRegistry.registerTask("workflow", {
        async execute(taskContext: TaskContext) {
          const { file, keep = false } = taskContext.config;
          const workflowTask = new WorkflowTask(
            file as string,
            keep as boolean,
            localWorkflowFile // Pass the current workflow file as parent
          );
          // Pass down the parent context to preserve the task registry and state
          return workflowTask.execute(taskContext);
        },
        validate: (config: Record<string, unknown>) =>
          !!config.file && typeof config.file === "string",
      });

      // Step 5.2.7: Create a task runner with the current task registry
      const taskRunner = new TaskRunner(taskRegistry);

      // Step 5.2.8: Use the current working directory for the workflow
      const workflowCwd = process.cwd();

      try {
        // Step 5.2.9: Execute the workflow tasks
        logger.info(`Running workflow: ${basename(localWorkflowFile)}`);
        await taskRunner.runWorkflow(config, workflowCwd);
        logger.box(green(bold("Workflow completed successfully!")));
      } finally {
        // No directory change was made, so nothing to clean up here
      }
    } catch (e) {
      // Step 5.2.10: Handle any errors during execution
      logger.error(red(`Workflow execution failed: ${(e as Error).message}`));
      throw e;
    } finally {
      // Step 5.2.11: Clean up temporary files if needed
      if (isTempFile && !this.keepTemp && existsSync(localWorkflowFile)) {
        try {
          unlinkSync(localWorkflowFile);
        } catch (e) {
          logger.warn(
            `Failed to clean up temporary file ${localWorkflowFile}: ${(e as Error).message}`
          );
        }
      }
    }
  }

  /**
   * Step 5.3: Validate the workflow configuration
   */
  validate(config: Record<string, unknown>): boolean {
    return !!config.file && typeof config.file === "string";
  }
}

/**
 * Step 6: Main command handler
 *
 * Step 6.1: Parse command line arguments
 * Step 6.2: Create and execute the workflow task
 * Step 6.3: Handle any errors and exit with appropriate status
 */
export async function handler(argv: ArgumentsCamelCase<WorkflowArgv>) {
  const { file, keep = false } = argv;

  try {
    // Create and execute the workflow task
    const workflowTask = new WorkflowTask(file, keep);
    await workflowTask.execute({
      cwd: process.cwd(),
      config: { file },
      taskRegistry: createDefaultTaskRegistry(),
    });
  } catch (e) {
    logger.error(red(`Workflow execution failed: ${(e as Error).message}`));
    process.exit(1);
  }
}
