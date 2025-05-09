import { context } from '../../context'
import { TaskConfig as CommonTaskConfig } from '../../types/common'

/**
 * Validates dependencies in the task configuration
 * @param depends Array of dependency names
 */
export function validateDependencies(depends: unknown): void {
  if (depends && Array.isArray(depends)) {
    for (const dep of depends) {
      if (!context.has(dep)) {
        throw new Error(`Missing dependency: ${dep}`)
      }
    }
  }
}

/**
 * Validates the repos configuration
 * @param repos The repos configuration to validate
 */
export function validateReposConfiguration(repos: unknown[]): void {
  if (!repos || !Array.isArray(repos) || repos.length === 0) {
    throw new Error('No repositories provided. The repos field must be an array of repository groups.')
  }
}

/**
 * Validates a repository group structure
 * @param repo The repository name
 * @param files The files array
 */
export function validateRepositoryGroup(repo: unknown, files: unknown): void {
  if (!repo || !files || !Array.isArray(files)) {
    throw new Error('Invalid repository group: repo and files array are required')
  }
}

/**
 * Validate the task configuration
 * @param config The task configuration to validate
 * @returns True if the configuration is valid, false otherwise
 */
export function validateGhFetchConfig(config: CommonTaskConfig): boolean {
  // Configuration is valid if repos is an array of repository groups
  return (
    Array.isArray(config.repos) &&
    config.repos.every((repoGroup: unknown) => {
      if (typeof repoGroup !== 'object' || repoGroup === null) return false

      const typedRepo = repoGroup as Record<string, unknown>

      // Required fields
      if (typeof typedRepo.repo !== 'string' || !Array.isArray(typedRepo.files)) {
        return false
      }

      // Optional fields
      if (typedRepo.sync !== undefined && typeof typedRepo.sync !== 'boolean') {
        return false
      }

      if (typedRepo.branch !== undefined && typeof typedRepo.branch !== 'string') {
        return false
      }

      // Validate files
      return typedRepo.files.every(
        (file: unknown) =>
          typeof file === 'object' &&
          file !== null &&
          typeof (file as Record<string, unknown>).source === 'string' &&
          typeof (file as Record<string, unknown>).local === 'string',
      )
    })
  )
}
