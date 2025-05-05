/**
 * Common type definitions for the project
 */

// Generic type for configuration values
export type ConfigValue = string | number | boolean | null | ConfigObject | ConfigValue[]

// Object type for configurations
export interface ConfigObject {
  [key: string]: unknown
}

// Type for task configuration
export type TaskConfig = Record<string, unknown>
