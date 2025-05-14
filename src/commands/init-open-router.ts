import { Argv } from 'yargs'
import { logger } from '../logger'
import { saveOpenRouterConfig } from '../utils/config'
import { bold, green } from 'picocolors'

type InitOpenRouterArgv = {
  model?: string
}

export const command = 'init-open-router'
export const describe = 'Initialize OpenRouter configuration for AI-powered tasks'
export const aliases = ['ior']

export function builder(yargs: Argv<InitOpenRouterArgv>): Argv {
  return yargs.option('model', {
    describe: 'Default OpenRouter model to use',
    type: 'string',
    default: 'mistralai/mistral-small-3.1-24b-instruct:free',
  })
}

export async function handler(argv: InitOpenRouterArgv) {
  logger.info('Setting up OpenRouter configuration')

  // Always prompt for model with the argument as default
  const model = await logger.prompt('Enter default OpenRouter model:', {
    type: 'text',
    default: argv.model || 'mistralai/mistral-small-3.1-24b-instruct:free',
  })

  // Prompt for API key
  const apiKey = await logger.prompt('Enter your OpenRouter API key:', {
    type: 'text',
    required: true,
  })

  // Save configuration
  await saveOpenRouterConfig({ apiKey, model })

  logger.log(`\nOpenRouter configuration ${green('successfully')} saved!`)
  logger.log(`Default model: ${bold(model)}`)
  logger.log(`API key: ${bold('********')}`)
  logger.log(
    `\nYou can now use OpenRouter in your workflows without providing the API key each time.`
  )
}
