import { ExecuteTask } from './execute'
import { PromptTask } from './prompt'
import { NpmCommandTask } from './npm-cmd'
import { NpmExecuteTask } from './npm-execute'
import { NpmInstallTask } from './npm-install'
import { GhFetchTask } from './gh-fetch'
import { EditJsonTask } from './edit-json'
import { WriteTask } from './write'
import { PatchFileTask } from './patch-file'
import { MergeFileTask } from './merge-file'
import { MergeTsFileTask } from './merge-ts-file'
import { AiMergeFileTask } from './ai-merge-file'
import { AiContentMergeTask } from './ai-content-merge'
import { AiModifyFileTask } from './ai-modify-file'
import { createTaskRegistry } from './registry'
import { TaskRunner } from './runner'
import { Task, TaskConfig, TaskContext, TaskRegistry, WorkflowConfig } from './types'
import { context } from '../context'

// Create and configure the default task registry
const createDefaultTaskRegistry = (): TaskRegistry => {
  const registry = createTaskRegistry()

  // Register built-in tasks
  registry.registerTask('execute', new ExecuteTask())
  registry.registerTask('prompt', new PromptTask())
  registry.registerTask('npm_cmd', new NpmCommandTask())
  registry.registerTask('npm_execute', new NpmExecuteTask())
  registry.registerTask('npm_install', new NpmInstallTask())
  registry.registerTask('gh_fetch', new GhFetchTask())
  registry.registerTask('edit_json', new EditJsonTask())
  registry.registerTask('write', new WriteTask())
  registry.registerTask('patch_file', new PatchFileTask())
  registry.registerTask('merge_file', new MergeFileTask())
  registry.registerTask('merge_ts_file', new MergeTsFileTask())
  registry.registerTask('ai_merge_file', new AiMergeFileTask())
  registry.registerTask('ai_content_merge', new AiContentMergeTask())
  registry.registerTask('ai_modify_file', new AiModifyFileTask())

  return registry
}

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
  AiMergeFileTask,
  context,
}
