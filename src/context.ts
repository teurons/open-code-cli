import { logger } from './logger'

/**
 * Context manager to store and retrieve user inputs
 */
export class Context {
  private static instance: Context
  private store: Record<string, any> = {}

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
  public set(key: string, value: any): void {
    this.store[key] = value
  }

  /**
   * Get a value from the context
   */
  public get(key: string): any {
    return this.store[key]
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
  public getAll(): Record<string, any> {
    return { ...this.store }
  }

  /**
   * Replace variables in a string with values from the context
   * Example: "Hello {{name}}" -> "Hello John"
   */
  public replaceVariables(text: string): string {
    return text.replace(/\{\{([^}]+)\}\}/g, (_, key) => {
      if (this.has(key.trim())) {
        return this.get(key.trim())
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
