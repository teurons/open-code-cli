import { createHash } from 'crypto'
import { existsSync, readFileSync, mkdirSync, copyFileSync, readdirSync } from 'fs'
import { logger } from '../src/logger'
import { context } from '../src/context'
import { TaskConfig as CommonTaskConfig } from '../src/types/common'
import { execSync } from 'child_process'
import { join, relative } from 'path'
import { tmpdir } from 'os'
import { randomUUID } from 'crypto'
import { TrackerConfig } from '../src/utils/tracker'

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
  return `"${arg.replace(/"/g, '"')}"` // Fix double slash issue
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
 * Enum representing possible actions to take on a file during sync
 */
export enum FileAction {
  COPY = 'copy', // Copy from source to local (only source changed)
  NONE = 'none', // No action needed (no changes or only local changes)
  MERGE = 'merge', // Need to merge changes (both source and local changed)
}

/**
 * Result object from actionOnFile function
 */
export interface FileActionResult {
  action: FileAction
  sourceFileHash: string
  localFileHash: string
  trackerFileHash: string | null
}

/**
 * Determine what action should be taken for a file during sync
 * @param sourcePath Source file path
 * @param localPath Local file path
 * @param repo Repository name
 * @param relativeFilePath Relative file path for tracking
 * @param cwd Current working directory
 * @returns Object containing the action to take and all relevant file hashes
 */
export function actionOnFile(
  sourcePath: string,
  localPath: string,
  repo: string,
  relativeFilePath: string,
  trackerConfig: TrackerConfig
): FileActionResult {
  // If local file doesn't exist, we need to copy it
  if (!existsSync(localPath)) {
    return {
      action: FileAction.COPY,
      sourceFileHash: getFileHash(sourcePath),
      localFileHash: '',
      trackerFileHash: null,
    }
  }

  // 1. Calculate hash of sourceFile - sourceFileHash
  const sourceFileHash = getFileHash(sourcePath)

  // 2. Calculate currentHash of localFile - localFileHash
  const localFileHash = getFileHash(localPath)

  // 3. Get hash of localFile from tracker - localFileHashFromTracker
  const trackerFileHash = trackerConfig.repos[repo]?.files?.[relativeFilePath]?.hash || null

  if (!trackerFileHash) {
    // First time syncing this file
    return {
      action: FileAction.COPY,
      sourceFileHash,
      localFileHash,
      trackerFileHash,
    }
  }

  // If localFileHash === trackerFileHash && localFileHash !== sourceFileHash
  // Then copy the file, it means only sourceFile changes, but localFile didn't change.
  if (localFileHash === trackerFileHash && localFileHash !== sourceFileHash) {
    return {
      action: FileAction.COPY,
      sourceFileHash,
      localFileHash,
      trackerFileHash,
    }
  }

  // If localFileHash !== trackerFileHash && trackerFileHash === sourceFileHash
  // It means file changed only in local, we needn't do anything
  if (localFileHash !== trackerFileHash && trackerFileHash === sourceFileHash) {
    return {
      action: FileAction.NONE,
      sourceFileHash,
      localFileHash,
      trackerFileHash,
    }
  }

  // If localFileHash !== trackerFileHash && localFileHash !== sourceFileHash
  // It means file changes in local, file changes in source - we need to merge
  if (localFileHash !== trackerFileHash && localFileHash !== sourceFileHash) {
    return {
      action: FileAction.MERGE,
      sourceFileHash,
      localFileHash,
      trackerFileHash,
    }
  }

  // Default case: no changes detected
  return {
    action: FileAction.NONE,
    sourceFileHash,
    localFileHash,
    trackerFileHash,
  }
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
  localPath: string
  repo: string
  relativeSourcePath: string
  relativeLocalPath: string
}

/**
 * Result of a file sync operation
 */
export interface FileSyncResult {
  operation: FileSyncOperation
  actionResult: FileActionResult
  syncResult: {
    success: boolean
    message?: string
    fileHash?: string
    syncedAt?: string
  }
}

/**
 * Summary of sync operations
 */
export interface SyncSummary {
  totalFiles: number
  successCount: number
  failCount: number
  copyCount: number
  noneCount: number
  mergeCount: number
  failedFiles: FileSyncResult[]
}

/**
 * Result of processing a repository
 */
export interface RepoProcessResult {
  repo: string
  results: FileSyncResult[]
  success: boolean
}

/**
 * Executes a batch of file sync operations
 * @param operations Array of file sync operations
 * @param trackerConfig Tracker configuration for file hash tracking
 * @returns Object containing updated file data and detailed results of each operation
 */
export function executeSyncOperations(
  operations: FileSyncOperation[],
  trackerConfig: TrackerConfig
): {
  updatedFiles: Record<string, Record<string, { hash: string; syncedAt: string }>>
  results: FileSyncResult[]
} {
  // Store updated file data by repository
  const updatedFiles: Record<string, Record<string, { hash: string; syncedAt: string }>> = {}
  // Store detailed results of each operation
  const results: FileSyncResult[] = []

  // Process operations directly
  for (const op of operations) {
    if (!op.repo) {
      logger.warn(`Repository not specified for file: ${op.relativeSourcePath}`)
      continue
    }

    // Ensure the repository entry exists in the files object
    if (!updatedFiles[op.repo]) {
      updatedFiles[op.repo] = {}
    }

    // Determine what action to take for this file
    const actionResult = actionOnFile(op.sourcePath, op.localPath, op.repo, op.relativeLocalPath, trackerConfig)
    const { action, sourceFileHash, localFileHash, trackerFileHash } = actionResult

    // Create a result object for this operation
    const result: FileSyncResult = {
      operation: op,
      actionResult,
      syncResult: {
        success: false,
      },
    }

    logger.info(
      `Action for ${op.relativeLocalPath}: ${action} | ` +
        `Source: ${sourceFileHash.substring(0, 8)} | ` +
        `Local: ${localFileHash.substring(0, 8) || 'N/A'} | ` +
        `Tracker: ${trackerFileHash ? trackerFileHash.substring(0, 8) : 'N/A'}`
    )

    // Process the file based on the determined action
    switch (action) {
      case FileAction.COPY:
        try {
          // Source file has changed, safe to copy
          copyFileSync(op.sourcePath, op.localPath)
          // Calculate and store hash and syncedAt for the updated file
          const fileHash = getFileHash(op.localPath)
          const now = new Date().toISOString()

          // Update the files object
          updatedFiles[op.repo]![op.relativeLocalPath] = {
            hash: fileHash,
            syncedAt: now,
          }

          // Update result
          result.syncResult = {
            success: true,
            fileHash,
            syncedAt: now,
            message: `Copied successfully`,
          }

          logger.success(`${op.relativeSourcePath} -> ${op.relativeLocalPath}`)
        } catch (error) {
          result.syncResult = {
            success: false,
            message: `Failed to copy: ${(error as Error).message}`,
          }
          logger.error(`Failed to copy ${op.relativeSourcePath}: ${(error as Error).message}`)
        }
        break

      case FileAction.MERGE:
        // Both source and local file have changed, need AI merge
        result.syncResult = {
          success: false,
          message: `Needs manual merge`,
        }
        logger.warn(
          `Both remote and local changes detected for ${op.relativeSourcePath}. Consider using ai_merge_file task.`
        )
        break

      case FileAction.NONE:
      default:
        // No changes or only local changes, skip
        result.syncResult = {
          success: true,
          message: `No changes needed`,
        }
        logger.debug(`File unchanged or only local changes, skipping: ${op.relativeLocalPath}`)
        break
    }

    // Add the result to our results array
    results.push(result)
  }

  return { updatedFiles, results }
}

/**
 * Generate a summary of sync operations
 * @param results Array of sync results
 * @returns Summary object with counts and details
 */
export function generateSyncSummary(results: FileSyncResult[]): SyncSummary {
  const successCount = results.filter(r => r.syncResult.success).length
  const failCount = results.length - successCount
  const copyCount = results.filter(r => r.actionResult.action === FileAction.COPY).length
  const noneCount = results.filter(r => r.actionResult.action === FileAction.NONE).length
  const mergeCount = results.filter(r => r.actionResult.action === FileAction.MERGE).length
  const failedFiles = results.filter(r => !r.syncResult.success)

  return {
    totalFiles: results.length,
    successCount,
    failCount,
    copyCount,
    noneCount,
    mergeCount,
    failedFiles,
  }
}

/**
 * Log a summary of sync operations
 * @param summary Summary object
 * @param isRepoLevel Whether this is a repository-level summary (true) or overall summary (false)
 * @param repoName Optional repository name for repo-level summaries
 */
export function logSyncSummary(summary: SyncSummary, isRepoLevel: boolean = false, repoName?: string): void {
  const scope = isRepoLevel && repoName ? `Repository ${repoName}` : 'Overall'

  logger.info(
    `${scope} sync summary: ${summary.successCount} files synced successfully, ${summary.failCount} files with issues`
  )
  logger.info(
    `${scope} action breakdown: ${summary.copyCount} copied, ${summary.noneCount} unchanged, ${summary.mergeCount} need merge`
  )

  if (summary.failCount > 0) {
    logger.warn(`${isRepoLevel ? 'Files' : 'Files across all repositories'} with issues:`)
    summary.failedFiles.forEach(r => {
      const path = isRepoLevel ? r.operation.relativeLocalPath : `${r.operation.repo}/${r.operation.relativeLocalPath}`
      logger.warn(`- ${path}: ${r.actionResult.action} - ${r.syncResult.message}`)
    })
  }
}

/**
 * Synchronize a directory by collecting file operations
 * @param sourceDir Source directory path (absolute path)
 * @param localDir Local directory path (absolute path)
 * @param syncOps Array to collect sync operations
 * @param tempDir Temporary directory path (absolute path, optional)
 * @param cwd Current working directory (absolute path, optional)
 * @param repo Repository name (optional)
 */
export function syncDirectoryChanges(
  sourceDir: string,
  localDir: string,
  syncOps: FileSyncOperation[],
  tempDir?: string,
  cwd?: string,
  repo?: string
): void {
  // Create local directory if needed
  if (!existsSync(localDir)) {
    mkdirSync(localDir, { recursive: true })
  }

  try {
    // Process each entry in the directory
    readdirSync(sourceDir, { withFileTypes: true }).forEach(entry => {
      const sourcePath = join(sourceDir, entry.name)
      const localPath = join(localDir, entry.name)

      if (entry.isDirectory()) {
        // Create subdirectory if it doesn't exist
        if (!existsSync(localPath)) {
          mkdirSync(localPath, { recursive: true })
        }

        // Recursively sync subdirectory
        syncDirectoryChanges(sourcePath, localPath, syncOps, tempDir, cwd, repo)
      } else {
        // Add file to sync operations
        const relativeSourcePath = tempDir ? relative(tempDir, sourcePath) : sourcePath
        const relativeLocalPath = cwd ? relative(cwd, localPath) : localPath

        syncOps.push({
          sourcePath,
          localPath,
          repo: repo || '',
          relativeSourcePath,
          relativeLocalPath,
        })
      }
    })
  } catch (error) {
    throw new Error(`Failed to sync directory ${sourceDir}: ${(error as Error).message}`)
  }
}

/**
 * Validate the task configuration
 * @param config The task configuration to validate
 * @returns True if the configuration is valid, false otherwise
 */
export function validateGhSyncConfig(config: CommonTaskConfig): boolean {
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
          typeof (file as Record<string, unknown>).local === 'string'
      )
    })
  )
}
