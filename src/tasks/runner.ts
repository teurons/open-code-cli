import { TaskConfig, TaskContext, TaskRegistry, WorkflowConfig } from './types';
import { logger } from '../logger';

export class TaskRunner {
  constructor(private taskRegistry: TaskRegistry) {}

  public async runWorkflow(workflowConfig: WorkflowConfig, cwd: string): Promise<void> {
    const { workflow } = workflowConfig;
    
    if (!workflow || !Array.isArray(workflow) || workflow.length === 0) {
      throw new Error('Invalid workflow configuration: workflow must be a non-empty array');
    }

    for (const [index, taskConfig] of workflow.entries()) {
      await this.runTask(taskConfig, cwd, index + 1, workflow.length);
    }
  }

  private async runTask(taskConfig: TaskConfig, cwd: string, current: number, total: number): Promise<void> {
    const { task: taskName, ...config } = taskConfig;
    
    const task = this.taskRegistry.getTask(taskName);
    if (!task) {
      throw new Error(`Task "${taskName}" not found in registry`);
    }

    if (!task.validate(config)) {
      throw new Error(`Invalid configuration for task "${taskName}"`);
    }

    const context: TaskContext = {
      cwd,
      config,
      taskRegistry: this.taskRegistry
    };

    logger.info(`Running task ${current}/${total}: ${taskName}`);
    
    try {
      await task.execute(context);
      logger.success(`Task ${taskName} completed successfully`);
    } catch (error) {
      logger.error(`Task ${taskName} failed: ${(error as Error).message}`);
      throw error;
    }
  }
}
