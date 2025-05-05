import { logger } from './logger'
import { ConfigValue, ConfigObject } from './types/common'

/**
 * Context manager to store and retrieve user inputs
 */
export class Context {
  private static instance: Context
  private store: ConfigObject = {}

  private constructor() {}

  /**
   * Get singleton instance of Context
   */
  public static getInstance(): Context {
    if (!Context.instance) {
      Context.instance = new Context()
    }
    return Context.instance
  }

  /**
   * Set a value in the context
   */
  public set(key: string, value: ConfigValue): void {
    this.store[key] = value
  }

  /**
   * Get a value from the context
   */
  public get(key: string): unknown {
    return this.store[key] ?? ''
  }

  /**
   * Check if a key exists in the context
   */
  public has(key: string): boolean {
    return key in this.store
  }

  /**
   * Get all values from the context
   */
  public getAll(): ConfigObject {
    return { ...this.store }
  }

  /**
   * Replace variables in a string with values from the context
   * Example: "Hello {{name}}" -> "Hello John"
   */
  public replaceVariables(text: string): string {
    return text.replace(/\{\{([^}]+)\}\}/g, (_, key) => {
      if (this.has(key.trim())) {
        const value = this.get(key.trim())
        return String(value)
      }
      logger.warn(`Variable {{${key.trim()}}} not found in context`)
      return `{{${key.trim()}}}`
    })
  }

  /**
   * Replace variables in an array of strings
   */
  public replaceVariablesInArray(array: string[]): string[] {
    return array.map((item) => this.replaceVariables(item))
  }

  /**
   * Clear all values from the context
   */
  public clear(): void {
    this.store = {}
  }
}

export const context = Context.getInstance()
