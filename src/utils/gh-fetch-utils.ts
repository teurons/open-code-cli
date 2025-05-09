import { createHash } from 'crypto'
import { existsSync, readFileSync, mkdirSync, copyFileSync } from 'fs'
import { logger } from '../logger'
import { context } from '../context'
import { TaskConfig as CommonTaskConfig } from '../types/common'
import { execSync } from 'child_process'
import { join } from 'path'
import { tmpdir } from 'os'
import { randomUUID } from 'crypto'

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
 * Escapes a string for safe use as a shell argument
 * Handles special characters like parentheses, spaces, etc.
 * @param arg The string to escape
 * @returns The escaped string
 */
export function escapeShellArg(arg: string): string {
  // For paths with special characters, we need to escape them properly
  // This handles parentheses, spaces, and other special shell characters
  return `"${arg.replace(/"/g, '\"')}"` // Fix double slash issue
}

/**
 * Calculate hash of a file for comparison
 * @param filePath Path to the file
 * @returns MD5 hash of the file contents
 */
export function getFileHash(filePath: string): string {
  if (!existsSync(filePath)) {
    return ''
  }

  try {
    const content = readFileSync(filePath)
    return createHash('md5').update(content).digest('hex')
  } catch (e) {
    logger.warn(`Failed to calculate hash for ${filePath}: ${(e as Error).message}`)
    return ''
  }
}

/**
 * Check if a file has changed by comparing hashes
 * @param sourcePath Source file path
 * @param destPath Destination file path
 * @returns True if the file has changed or destination doesn't exist
 */
export function hasFileChanged(sourcePath: string, destPath: string): boolean {
  // If destination doesn't exist, it has changed
  if (!existsSync(destPath)) {
    return true
  }

  // Compare file hashes
  const sourceHash = getFileHash(sourcePath)
  const destHash = getFileHash(destPath)

  return sourceHash !== destHash
}

/**
 * Gets the latest commit hash for a GitHub repository and branch
 * @param repo The repository name in the format 'owner/repo'
 * @param branch The branch name
 * @returns The latest commit hash
 */
export function getLatestCommitHash(repo: string, branch: string): string {
  return execSync(`git ls-remote https://github.com/${repo}.git ${branch} | cut -f1`).toString().trim()
}

/**
 * Downloads a GitHub repository to a temporary directory
 * @param repo The repository name in the format 'owner/repo'
 * @param branch The branch name
 * @returns The path to the temporary directory and a cleanup function
 */
export function downloadRepository(repo: string, branch: string): { tempDir: string; cleanup: () => void } {
  const tempDir = join(tmpdir(), `gh-fetch-${randomUUID()}`)
  mkdirSync(tempDir, { recursive: true })

  // Download the entire repository once
  logger.info(`Downloading repository ${repo} to temporary directory`)
  const gigetCommand = `npx giget gh:${repo}#${branch} ${escapeShellArg(tempDir)} --force`
  execSync(gigetCommand, { stdio: 'inherit', cwd: process.cwd() })

  // Return the temp directory and a cleanup function
  return {
    tempDir,
    cleanup: () => {
      try {
        execSync(`rm -rf ${escapeShellArg(tempDir)}`, { stdio: 'inherit' })
      } catch (e) {
        logger.warn(`Failed to clean up temporary directory: ${(e as Error).message}`)
      }
    },
  }
}

/**
 * Represents a file sync operation
 */
export interface FileSyncOperation {
  sourcePath: string
  destPath: string
  displaySource: string
  processedDestination: string
  repo: string
  relativeSourcePath?: string
  relativeDestPath?: string
}

/**
 * Executes a batch of file sync operations
 * @param operations Array of file sync operations
 */
export function executeSyncOperations(operations: FileSyncOperation[]): void {
  for (const op of operations) {
    if (hasFileChanged(op.sourcePath, op.destPath)) {
      copyFileSync(op.sourcePath, op.destPath)
      logger.success(
        `${op.relativeSourcePath || op.displaySource} -> ${op.relativeDestPath || op.processedDestination}`,
      )
    } else {
      // logger.info(`File unchanged, skipping: ${op.relativeDestPath || op.processedDestination}`)
    }
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
          typeof (file as Record<string, unknown>).destination === 'string',
      )
    })
  )
}
