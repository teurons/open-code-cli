import { TaskConfig as CommonTaskConfig } from '../types/common'

export interface Task {
  execute(context: TaskContext): Promise<void>
  validate(config: CommonTaskConfig): boolean
}

export interface TaskContext {
  cwd: string
  config: CommonTaskConfig
  taskRegistry: TaskRegistry
  updateWorkingDir?: (newDir: string) => void
}

export interface TaskRegistry {
  getTask(name: string): Task | undefined
  registerTask(name: string, task: Task): void
}

export interface TaskConfig {
  task: string
  [key: string]: unknown
}

export interface WorkflowConfig {
  workflow: TaskConfig[]
}
