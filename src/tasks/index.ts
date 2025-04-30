import { ExecuteTask } from './execute';
import { createTaskRegistry } from './registry';
import { TaskRunner } from './runner';
import { Task, TaskConfig, TaskContext, TaskRegistry, WorkflowConfig } from './types';

// Create and configure the default task registry
const createDefaultTaskRegistry = (): TaskRegistry => {
  const registry = createTaskRegistry();
  
  // Register built-in tasks
  registry.registerTask('execute', new ExecuteTask());
  
  return registry;
};

export {
  Task,
  TaskConfig,
  TaskContext,
  TaskRegistry,
  WorkflowConfig,
  TaskRunner,
  createTaskRegistry,
  createDefaultTaskRegistry,
  ExecuteTask
};
