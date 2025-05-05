export interface Task {
  execute(context: TaskContext): Promise<void>;
  validate(config: Record<string, any>): boolean;
}

export interface TaskContext {
  cwd: string;
  config: Record<string, any>;
  taskRegistry: TaskRegistry;
  updateWorkingDir?: (newDir: string) => void;
}

export interface TaskRegistry {
  getTask(name: string): Task | undefined;
  registerTask(name: string, task: Task): void;
}

export interface TaskConfig {
  task: string;
  [key: string]: any;
}

export interface WorkflowConfig {
  workflow: TaskConfig[];
}
