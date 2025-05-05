import { ArgumentsCamelCase, Argv } from 'yargs'
import { logger } from '../logger'
import { context } from '../context'

interface PromptArgv {
  name: string
  message: string
  type: 'text' | 'select' | 'confirm' | 'input'
  default?: string
  options?: Array<string | { label: string; value: string; hint?: string }>
}

export const command = 'prompt'
export const describe = 'Prompt user for input and store in context'
export const aliases = ['p']

export function builder(yargs: Argv<PromptArgv>): Argv {
  return yargs
    .option('name', {
      type: 'string',
      description: 'Name of the variable to store the input',
      demandOption: true,
    })
    .option('message', {
      type: 'string',
      description: 'Message to display to the user',
      demandOption: true,
    })
    .option('type', {
      type: 'string',
      description: 'Type of prompt',
      choices: ['text', 'select', 'confirm', 'input'],
      default: 'input',
    })
    .option('default', {
      type: 'string',
      description: 'Default value',
    })
    .option('options', {
      type: 'array',
      description: 'Options for select prompt',
    })
}

export async function handler(argv: ArgumentsCamelCase<PromptArgv>) {
  const { name, message, type, default: defaultValue, options } = argv

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
  
  return response
}
