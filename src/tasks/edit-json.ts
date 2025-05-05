import { Task, TaskContext } from './types'
import { TaskConfig as CommonTaskConfig } from '../types/common'
import { logger } from '../logger'
import { context } from '../context'
import { existsSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'

type JsonValue = string | number | boolean | null | { [key: string]: JsonValue } | JsonValue[]
type JsonObject = { [key: string]: JsonValue }

/**
 * Task for editing JSON files like package.json
 * This provides a more structured way to modify JSON files compared to raw file editing
 */
export class EditJsonTask implements Task {
  public async execute(taskContext: TaskContext): Promise<void> {
    const { file, operations, depends } = taskContext.config as {
      file?: string
      operations?: Array<{
        type: 'set' | 'merge' | 'delete'
        path: string | string[]
        value?: JsonValue
      }>
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
      throw new Error('No file specified for JSON editing')
    }

    if (!operations || !Array.isArray(operations) || operations.length === 0) {
      throw new Error('No operations specified for JSON editing')
    }

    // Replace variables in file path
    const processedFile = context.replaceVariables(file)
    const filePath = join(cwd, processedFile)

    // Check if file exists
    if (!existsSync(filePath)) {
      throw new Error(`File not found: ${filePath}`)
    }

    try {
      // Read and parse JSON file
      const fileContent = readFileSync(filePath, 'utf-8')
      let jsonData: JsonObject

      try {
        jsonData = JSON.parse(fileContent) as JsonObject
      } catch (e) {
        throw new Error(`Failed to parse JSON file ${filePath}: ${(e as Error).message}`)
      }

      // Apply operations
      for (const operation of operations) {
        const { type, path, value } = operation

        if (!type || !path) {
          throw new Error('Invalid operation: type and path are required')
        }

        // Ensure path is valid
        if (typeof path !== 'string' && !Array.isArray(path)) {
          throw new Error('Path must be a string or an array of strings')
        }

        // Process the path into an array of keys
        const pathParts = Array.isArray(path) ? path : path.split('.')

        switch (type) {
          case 'set':
            if (value === undefined) {
              throw new Error('Value is required for set operation')
            }
            this.setValue(jsonData, pathParts, value)
            logger.info(`Set ${pathParts.join('.')} to ${JSON.stringify(value)}`)
            break

          case 'merge':
            if (value === undefined || typeof value !== 'object') {
              throw new Error('Value must be an object for merge operation')
            }
            this.mergeValue(jsonData, pathParts, value)
            logger.info(`Merged object at ${pathParts.join('.')}`)
            break

          case 'delete':
            this.deleteValue(jsonData, pathParts)
            logger.info(`Deleted ${pathParts.join('.')}`)
            break

          default:
            throw new Error(`Unknown operation type: ${type}`)
        }
      }

      // Write back to file
      writeFileSync(filePath, JSON.stringify(jsonData, null, 2) + '\n')
      logger.success(`Successfully updated ${filePath}`)
    } catch (e) {
      throw new Error(`Failed to edit JSON file ${filePath}: ${(e as Error).message}`)
    }
  }

  private setValue(obj: JsonObject, path: string[], value: JsonValue): void {
    if (!path.length) return

    const key = path[0]
    if (key === undefined) return

    if (path.length === 1) {
      obj[key] = value
      return
    }

    if (obj[key] === undefined || obj[key] === null) {
      obj[key] = {}
    } else if (typeof obj[key] !== 'object' || Array.isArray(obj[key])) {
      obj[key] = {}
    }

    this.setValue(obj[key] as JsonObject, path.slice(1), value)
  }

  private mergeValue(obj: JsonObject, path: string[], value: JsonValue): void {
    if (!path.length) {
      // Merge directly into the object if value is an object
      if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
        Object.assign(obj, value)
      }
      return
    }

    const key = path[0]
    if (key === undefined) return

    if (obj[key] === undefined || obj[key] === null) {
      obj[key] = {}
    } else if (typeof obj[key] !== 'object' || Array.isArray(obj[key])) {
      obj[key] = {}
    }

    if (path.length === 1) {
      // We're at the target object, merge the value if both are objects
      if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
        Object.assign(obj[key] as JsonObject, value)
      }
    } else {
      // Continue traversing
      this.mergeValue(obj[key] as JsonObject, path.slice(1), value)
    }
  }

  private deleteValue(obj: JsonObject, path: string[]): void {
    if (!path.length) return

    const key = path[0]
    if (key === undefined) return

    if (path.length === 1) {
      delete obj[key]
      return
    }

    if (obj[key] === undefined || obj[key] === null || typeof obj[key] !== 'object' || Array.isArray(obj[key])) {
      return // Nothing to delete
    }

    this.deleteValue(obj[key] as JsonObject, path.slice(1))
  }

  public validate(config: CommonTaskConfig): boolean {
    return (
      typeof config.file === 'string' &&
      Array.isArray(config.operations) &&
      config.operations.every(
        (op: unknown) =>
          typeof op === 'object' &&
          typeof op.type === 'string' &&
          (typeof op.path === 'string' || Array.isArray(op.path)),
      )
    )
  }
}
