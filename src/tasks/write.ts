import { Task, TaskContext } from './types'
import { logger } from '../logger'
import { context } from '../context'
import { existsSync, writeFileSync, appendFileSync, mkdirSync } from 'fs'
import { dirname } from 'path'
import { join } from 'path'

interface WriteFile {
  path: string
  content?: string
  append?: string
}

/**
 * Task for writing content to files
 * Supports both creating new files and appending to existing ones
 */
export class WriteTask implements Task {
  public async execute(taskContext: TaskContext): Promise<void> {
    const { files, depends } = taskContext.config as {
      files?: WriteFile[]
      depends?: string[]
    }
    const { cwd } = taskContext

    // Check dependencies
    if (depends && Array.isArray(depends)) {
      for (const dep of depends) {
        if (!context.has(dep)) {
          throw new Error(`Missing dependency: ${dep}`)
        }
      }
    }

    if (!files || !Array.isArray(files) || files.length === 0) {
      throw new Error('No files specified for writing')
    }

    for (const file of files) {
      const { path, content, append } = file

      if (!path) {
        throw new Error('File path is required')
      }

      if (!content && !append) {
        throw new Error('Either content or append is required')
      }

      // Replace variables in path and content
      const processedPath = context.replaceVariables(path)
      const fullPath = join(cwd, processedPath)

      // Create directory if it doesn't exist
      const dir = dirname(fullPath)
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true })
        logger.info(`Created directory: ${dir}`)
      }

      try {
        if (content) {
          // Replace variables in content
          const processedContent = context.replaceVariables(content)

          // Write content to file
          writeFileSync(fullPath, processedContent)
          logger.success(`Created file: ${fullPath}`)
        }

        if (append) {
          // Replace variables in append content
          const processedAppend = context.replaceVariables(append)

          // Append content to file
          appendFileSync(fullPath, processedAppend)
          logger.success(`Appended to file: ${fullPath}`)
        }
      } catch (e) {
        throw new Error(`Failed to write to file ${fullPath}: ${(e as Error).message}`)
      }
    }
  }

  public validate(config: Record<string, any>): boolean {
    return (
      Array.isArray(config.files) &&
      config.files.every(
        (file: any) =>
          typeof file === 'object' &&
          typeof file.path === 'string' &&
          (typeof file.content === 'string' || typeof file.append === 'string'),
      )
    )
  }
}
