import { Task, TaskContext } from './types'
import { logger } from '../logger'
import { context } from '../context'

export class PromptTask implements Task {
  public async execute(taskContext: TaskContext): Promise<void> {
    const { name, message, type = 'input', default: defaultValue, options } = taskContext.config

    if (!name || !message) {
      throw new Error('Prompt task requires "name" and "message" properties')
    }

    // Handle different prompt types
    let response

    if (type === 'select' && options) {
      response = await logger.prompt(message, {
        type: 'select',
        options,
      })
    } else if (type === 'confirm') {
      response = await logger.prompt(message, {
        type: 'confirm',
      })
    } else {
      // Default to text input
      response = await logger.prompt(message, {
        type: 'text',
        default: defaultValue,
      })
    }

    // Store the response in the context
    context.set(name, typeof response === 'object' ? JSON.stringify(response) : response)
    logger.success(`Set ${name} to: ${String(response)}`)
  }

  public validate(config: Record<string, any>): boolean {
    return Boolean(config.name && config.message)
  }
}
