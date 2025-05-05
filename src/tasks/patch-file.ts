import { Task, TaskContext } from './types'
import { TaskConfig as CommonTaskConfig } from '../types/common'
import { logger } from '../logger'
import { context } from '../context'
import { existsSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'

interface PatchOperation {
  search: string
  replace: string
}

/**
 * Task for patching files by replacing specific text patterns
 * Similar to sed but with more structured approach
 */
export class PatchFileTask implements Task {
  public async execute(taskContext: TaskContext): Promise<void> {
    const { file, operations, depends } = taskContext.config as {
      file: string
      operations: PatchOperation[]
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

    if (!file) {
      throw new Error('File path is required')
    }

    if (!operations || !Array.isArray(operations) || operations.length === 0) {
      throw new Error('At least one patch operation is required')
    }

    // Replace variables in file path
    const processedPath = context.replaceVariables(file)
    const fullPath = join(cwd, processedPath)

    // Check if file exists
    if (!existsSync(fullPath)) {
      throw new Error(`File not found: ${fullPath}`)
    }

    try {
      // Read file content
      let fileContent = readFileSync(fullPath, 'utf-8')
      let patchCount = 0

      // Apply each patch operation
      for (const op of operations) {
        const { search, replace } = op

        if (!search) {
          throw new Error('Search pattern is required for patch operation')
        }

        // Replace variables in search and replace patterns
        const processedSearch = context.replaceVariables(search)
        const processedReplace = replace ? context.replaceVariables(replace) : ''

        // Apply the replacement
        const prevContent = fileContent
        fileContent = fileContent.replace(new RegExp(processedSearch, 'g'), processedReplace)

        if (prevContent !== fileContent) {
          patchCount++
          logger.info(`Applied patch to ${fullPath}`)
        }
      }

      // Write the modified content back to the file
      writeFileSync(fullPath, fileContent)

      if (patchCount > 0) {
        logger.success(`Successfully patched ${fullPath} with ${patchCount} operations`)
      } else {
        logger.warn(`No changes made to ${fullPath} - patterns not found`)
      }
    } catch (e) {
      throw new Error(`Failed to patch file ${fullPath}: ${(e as Error).message}`)
    }
  }

  public validate(config: CommonTaskConfig): boolean {
    return (
      typeof config.file === 'string' &&
      Array.isArray(config.operations) &&
      config.operations.every((op: unknown) => typeof op === 'object' && typeof op.search === 'string')
    )
  }
}
