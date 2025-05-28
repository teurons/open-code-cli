import { TaskConfig, TaskContext, TaskRegistry, WorkflowConfig } from "./types";
import { logger } from "../logger";
import * as path from "path";
import { context } from "../context";

export class TaskRunner {
  private currentWorkingDir: string;

  constructor(private taskRegistry: TaskRegistry) {
    this.currentWorkingDir = process.cwd();
  }

  public async runWorkflow(
    workflowConfig: WorkflowConfig,
    cwd: string
  ): Promise<void> {
    const { workflow } = workflowConfig;

    if (!workflow || !Array.isArray(workflow) || workflow.length === 0) {
      throw new Error(
        "Invalid workflow configuration: workflow must be a non-empty array"
      );
    }

    // Set initial working directory
    this.currentWorkingDir = cwd;

    // Store the initial working directory in the context
    context.set("initial_cwd", this.currentWorkingDir);

    for (const [index, taskConfig] of workflow.entries()) {
      await this.runTask(taskConfig, index + 1, workflow.length);
    }
  }

  private async runTask(
    taskConfig: TaskConfig,
    current: number,
    total: number
  ): Promise<void> {
    const { task: taskName, ...config } = taskConfig;

    const task = this.taskRegistry.getTask(taskName);
    if (!task) {
      throw new Error(`Task "${taskName}" not found in registry`);
    }

    if (!task.validate(config)) {
      throw new Error(`Invalid configuration for task "${taskName}"`);
    }

    const context: TaskContext = {
      cwd: this.currentWorkingDir,
      config,
      taskRegistry: this.taskRegistry,
      updateWorkingDir: (newDir: string) => {
        // Handle relative paths
        if (!path.isAbsolute(newDir)) {
          newDir = path.resolve(this.currentWorkingDir, newDir);
        }

        // Update the current working directory
        this.currentWorkingDir = newDir;
        logger.info(`Working directory updated to: ${newDir}`);
      },
    };

    logger.start(`Running task ${current}/${total}: ${taskName}`);

    try {
      await task.execute(context);
      logger.success(`Task ${taskName} completed successfully`);
    } catch (error) {
      logger.error(`Task ${taskName} failed: ${(error as Error).message}`);
      throw error;
    }
  }
}
