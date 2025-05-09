import { ArgumentsCamelCase, Argv } from 'yargs'
import { existsSync, readFileSync } from 'fs'
import { join, isAbsolute } from 'path'
import * as process from 'node:process'
import { logger } from '../logger'
import { bold, green, red } from 'picocolors'
import { createDefaultTaskRegistry, TaskRunner, WorkflowConfig } from '../tasks'

interface ChooseWorkflowArgv {
  file: string
}

export const command = 'choose-workflow <file>'
export const describe = 'Select and run specific tasks from a workflow file'
export const aliases = ['cw']

export function builder(yargs: Argv<ChooseWorkflowArgv>): Argv {
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

export async function handler(argv: ArgumentsCamelCase<ChooseWorkflowArgv>) {
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

    // Extract task information for selection
    const tasks = config.workflow.map((task, index) => {
      const taskType = task.task || 'unknown'
      let description = `[${index + 1}] ${taskType}`

      // Add more descriptive information based on task type
      if (taskType === 'prompt') {
        description += `: "${task.message || 'User input'}" (name: ${task.name || 'unnamed'})`
      } else if (taskType === 'execute') {
        description += `: ${task.command || 'Run command'}`
      } else if (taskType === 'npm_cmd' || taskType === 'npm_execute') {
        const cmds = Array.isArray(task.commands) ? task.commands.join(', ') : task.command || ''
        description += `: ${cmds}`
      } else if (taskType === 'npm_install') {
        const pkgs = Array.isArray(task.packages) ? task.packages.join(', ') : ''
        description += `: ${pkgs}`
      } else if (taskType === 'write') {
        if (Array.isArray(task.files)) {
          const fileCount = task.files.length
          const firstFile = task.files[0]?.path || ''
          description += `: ${firstFile}${fileCount > 1 ? ` (+${fileCount - 1} more)` : ''}`
        }
      } else if (taskType === 'gh_sync') {
        const repoCount = task.repos?.length || 0
        description += `: ${repoCount} repos`
      } else if (taskType === 'ai_content_merge') {
        description += `: ${task.targetFile || ''}`
      } else if (taskType === 'ai_modify_file' || taskType === 'ai_merge_file') {
        description += `: ${task.path || task.targetFile || ''}`
      } else if (taskType === 'merge_file') {
        if (Array.isArray(task.files)) {
          const fileCount = task.files.length
          const firstFile = task.files[0]?.path || ''
          description += `: ${firstFile}${fileCount > 1 ? ` (+${fileCount - 1} more)` : ''}`
        }
      } else if (taskType === 'edit_json') {
        description += `: ${task.file || ''}`
      }

      return {
        title: description,
        value: index,
      }
    })

    // Prompt user to select tasks
    logger.info(`Select tasks to run from ${file} (use spacebar to select multiple, enter to confirm):`)

    // Convert our tasks to a format that works with consola prompt
    // Using simple strings as options to avoid type conflicts
    const options = tasks.map((task) => task.title)

    // Use the prompt with simple string options
    const result = await logger.prompt('Choose tasks to run:', {
      type: 'multiselect',
      options,
    })

    // Handle the result safely - result will be array of selected indices
    const selectedIndices: number[] = []

    if (Array.isArray(result)) {
      // Get the indices of selected tasks
      for (let i = 0; i < options.length; i++) {
        const option = options[i]
        if (option && result.includes(option)) {
          selectedIndices.push(i)
        }
      }
    }

    if (selectedIndices.length === 0) {
      logger.warn('No tasks selected, exiting.')
      return
    }

    // Create a new workflow with only the selected tasks
    const selectedWorkflow: WorkflowConfig = {
      workflow: selectedIndices.map((index) => config.workflow[index]).filter((task) => task !== undefined), // Filter out any undefined tasks
    }

    // Run the selected tasks
    logger.info(`Running ${selectedIndices.length} selected tasks from ${file}`)
    await taskRunner.runWorkflow(selectedWorkflow, process.cwd())

    logger.box(green(bold('Selected workflow tasks completed successfully!')))
  } catch (e) {
    logger.error(red(`Workflow execution failed: ${(e as Error).message}`))
  }
}
