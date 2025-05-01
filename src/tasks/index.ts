import { ExecuteTask } from './execute';
import { PromptTask } from './prompt';
import { NpmCommandTask } from './npm-cmd';
import { NpmExecuteTask } from './npm-execute';
import { NpmInstallTask } from './npm-install';
import { GhFetchTask } from './gh-fetch';
import { EditJsonTask } from './edit-json';
import { WriteTask } from './write';
import { createTaskRegistry } from './registry';
import { TaskRunner } from './runner';
import { Task, TaskConfig, TaskContext, TaskRegistry, WorkflowConfig } from './types';
import { context } from '../context';

// Create and configure the default task registry
const createDefaultTaskRegistry = (): TaskRegistry => {
  const registry = createTaskRegistry();
  
  // Register built-in tasks
  registry.registerTask('execute', new ExecuteTask());
  registry.registerTask('prompt', new PromptTask());
  registry.registerTask('npm_cmd', new NpmCommandTask());
  registry.registerTask('npm_execute', new NpmExecuteTask());
  registry.registerTask('npm_install', new NpmInstallTask());
  registry.registerTask('gh_fetch', new GhFetchTask());
  registry.registerTask('edit_json', new EditJsonTask());
  registry.registerTask('write', new WriteTask());
  
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
  ExecuteTask,
  PromptTask,
  NpmCommandTask,
  NpmInstallTask,
  GhFetchTask,
  EditJsonTask,
  context
};
