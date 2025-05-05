import { ArgumentsCamelCase, Argv } from 'yargs'
import { existsSync, readFileSync } from 'fs'
import { join, isAbsolute } from 'path'
import * as process from 'node:process'
import { logger } from '../logger'
import { bold, green, red } from 'picocolors'
import { createDefaultTaskRegistry, TaskRunner, WorkflowConfig } from '../tasks'

interface WorkflowArgv {
  file: string
}

export const command = 'workflow <file>'
export const describe = 'Run a workflow from a JSON file'
export const aliases = ['w']

export function builder(yargs: Argv<WorkflowArgv>): Argv {
  return yargs
    .positional('file', {
      type: 'string',
      description: 'path to workflow JSON file',
      demandOption: true,
    })
    .coerce('file', (value: string) => {
      if (isAbsolute(value)) {
        return value
      }
      return join(process.cwd(), value)
    })
}

export async function handler(argv: ArgumentsCamelCase<WorkflowArgv>) {
  const { file } = argv

  if (!existsSync(file)) {
    logger.error(red(`Workflow file not found: ${file}`))
    return
  }

  try {
    const fileContent = readFileSync(file, 'utf-8')
    const config: WorkflowConfig = JSON.parse(fileContent)

    if (!config.workflow || !Array.isArray(config.workflow)) {
      logger.error(red('Invalid workflow file: workflow array not found'))
      return
    }

    // Create task registry and runner
    const taskRegistry = createDefaultTaskRegistry()
    const taskRunner = new TaskRunner(taskRegistry)

    // Run the workflow
    logger.info(`Loading workflow from ${file}`)
    await taskRunner.runWorkflow(config, process.cwd())

    logger.box(green(bold('Workflow completed successfully!')))
  } catch (e) {
    logger.error(red(`Workflow execution failed: ${(e as Error).message}`))
  }
}


