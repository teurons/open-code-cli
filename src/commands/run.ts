import { isAbsolute, join } from 'path';
import { ArgumentsCamelCase, Argv } from 'yargs';
import * as process from 'node:process';
import { logger } from '../logger';
import { readFileSync } from 'fs';
import { createDefaultTaskRegistry, TaskRunner, WorkflowConfig } from '../tasks';

interface RunArgv {
  config: string;
  cwd?: string;
}

export const command = 'run <config>';
export const describe = 'Run a workflow from a JSON configuration file';
export const aliases = ['r'];

export function builder(yargs: Argv<RunArgv>): Argv {
  return yargs
    .positional('config', {
      type: 'string',
      description: 'Path to the JSON configuration file',
      demandOption: true,
    })
    .option('cwd', {
      type: 'string',
      description: 'Working directory for the workflow (defaults to current directory)',
    })
    .coerce('config', (value: string) => {
      if (isAbsolute(value)) {
        return value;
      }
      return join(process.cwd(), value);
    })
    .coerce('cwd', (value?: string) => {
      if (!value) {
        return process.cwd();
      }
      if (isAbsolute(value)) {
        return value;
      }
      return join(process.cwd(), value);
    });
}

export async function handler(argv: ArgumentsCamelCase<RunArgv>) {
  try {
    const { config: configPath, cwd = process.cwd() } = argv;
    
    logger.info(`Loading workflow from ${configPath}`);
    
    // Read and parse the configuration file
    const configContent = readFileSync(configPath, 'utf-8');
    const workflowConfig = JSON.parse(configContent) as WorkflowConfig;
    
    // Create task registry and runner
    const taskRegistry = createDefaultTaskRegistry();
    const taskRunner = new TaskRunner(taskRegistry);
    
    // Run the workflow
    await taskRunner.runWorkflow(workflowConfig, cwd as string);
    
    logger.success('Workflow completed successfully');
  } catch (error) {
    logger.error(`Workflow execution failed: ${(error as Error).message}`);
    process.exit(1);
  }
}
