import { Task, TaskRegistry } from './types'

export class DefaultTaskRegistry implements TaskRegistry {
  private tasks: Map<string, Task> = new Map()

  public getTask(name: string): Task | undefined {
    return this.tasks.get(name)
  }

  public registerTask(name: string, task: Task): void {
    this.tasks.set(name, task)
  }
}

export const createTaskRegistry = (): TaskRegistry => {
  return new DefaultTaskRegistry()
}
