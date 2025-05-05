import { Task, TaskContext } from './types'
import { TaskConfig as CommonTaskConfig } from '../types/common'
import { logger } from '../logger'
import { context } from '../context'
import { detect } from '@antfu/ni'
import { execSync } from 'child_process'

/**
 * Task for executing basic package manager commands
 * This is for running commands like npm install, npm run dev, etc.
 */
export class NpmCommandTask implements Task {
  public async execute(taskContext: TaskContext): Promise<void> {
    const { command, commands, package_manager = 'auto', depends } = taskContext.config
    const { cwd } = taskContext

    // Check dependencies
    if (depends && Array.isArray(depends)) {
      for (const dep of depends) {
        if (!context.has(dep)) {
          throw new Error(`Missing dependency: ${dep}`)
        }
      }
    }

    // Prepare commands
    let cmds: string[] = []
    if (command) {
      cmds = [command]
    } else if (commands && Array.isArray(commands)) {
      cmds = [...commands]
    }

    if (cmds.length === 0) {
      throw new Error('NpmCommand task requires either "command" or "commands" property')
    }

    // Replace variables in commands
    const processedCommands = context.replaceVariablesInArray(cmds)

    // Detect package manager
    let pm = package_manager
    if (pm === 'auto') {
      try {
        pm = (await detect({ cwd })) || 'npm'
        logger.success(`Detected package manager: ${pm}`)
      } catch (e) {
        logger.warn(`Failed to detect package manager, using npm: ${(e as Error).message}`)
        pm = 'npm'
      }
    }

    // Execute commands with the package manager
    for (const cmd of processedCommands) {
      const finalCmd = `${pm} ${cmd}`

      logger.info(`Executing: ${finalCmd}`)

      try {
        execSync(finalCmd, { stdio: 'inherit', cwd })
        logger.success(`Command completed successfully`)
      } catch (e) {
        throw new Error(`Command failed: ${(e as Error).message}`)
      }
    }
  }

  public validate(config: CommonTaskConfig): boolean {
    return Boolean(config.command || (config.commands && Array.isArray(config.commands)))
  }
}
