import { Task, TaskContext } from './types'
import { TaskConfig as CommonTaskConfig } from '../types/common'
import { logger } from '../logger'
import { context } from '../context'
import { existsSync, mkdirSync, statSync } from 'fs'
import { dirname, join, normalize, relative } from 'path'
import { readTrackerConfig, writeTrackerConfig } from '../utils/tracker'
import {
  validateDependencies,
  validateReposConfiguration,
  validateRepositoryGroup,
  validateGhSyncConfig,
  getLatestCommitHash,
  downloadRepository,
  FileSyncOperation,
  executeSyncOperations,
  FileSyncResult,
  generateSyncSummary,
  logSyncSummary,
  syncDirectoryChanges,
} from '../utils/gh-sync-utils'

/**
 * Represents a file or directory to be fetched from a GitHub repository
 */
interface FetchFile {
  /** Source path within the repository (relative path) */
  source: string
  /** Local path on the filesystem (relative path) */
  local: string
}

/**
 * Represents a GitHub repository with a list of files/directories to fetch
 */
interface RepoGroup {
  /** GitHub repository in the format 'owner/repo' */
  repo: string
  /** List of files/directories to fetch from this repository */
  files: FetchFile[]
  /** Whether to sync this repository (track commits and only fetch if there are changes) */
  sync?: boolean
  /** Branch to fetch from (defaults to main) */
  branch?: string
}

export class GhSyncTask implements Task {
  /**
   * Validate the task configuration
   * @param config The task configuration
   * @returns Whether the configuration is valid
   */
  validate(config: CommonTaskConfig): boolean {
    return validateGhSyncConfig(config)
  }
  // updateDirectoryFileHashes method removed as it's no longer needed
  /**
   * Execute the GitHub fetch task
   * @param taskContext The task context containing configuration and working directory
   */
  public async execute(taskContext: TaskContext): Promise<void> {
    const { repos, depends } = taskContext.config
    const { cwd } = taskContext

    // Initialize tracker file if it doesn't exist
    const trackerConfig = readTrackerConfig(cwd)
    writeTrackerConfig(cwd, trackerConfig)

    // Check dependencies and validate repos configuration
    validateDependencies(depends)
    validateReposConfiguration(repos as unknown[])

    const typedRepos = repos as unknown[]
    const allResults: FileSyncResult[] = []

    // Process each repository group directly
    for (const repoGroup of typedRepos) {
      const { repo, files, sync = false, branch = 'main' } = repoGroup as RepoGroup

      // Validate repository group structure
      validateRepositoryGroup(repo, files)

      // Replace variables in repo name
      const processedRepo = context.replaceVariables(repo)

      // Process this repository and collect results
      const repoResult = await this.processRepo(processedRepo, files, cwd, sync, branch)
      allResults.push(...repoResult.results)
    }

    // Only log overall summary if there are actual file operations
    if (allResults.length > 0) {
      // Generate and log overall summary
      const overallSummary = generateSyncSummary(allResults)
      logSyncSummary(overallSummary, false)
    }
  }

  // Using imported utility functions directly

  // Using imported utility functions for directory synchronization

  /**
   * Process a repository by downloading it once and extracting all files
   * @param repo The repository name (owner/repo)
   * @param files The files to extract from the repository
   * @param cwd The current working directory
   * @param sync Whether to sync this repository (track commits and only fetch if there are changes)
   * @param branch Branch to fetch from
   * @returns Object containing sync results and status
   */
  private async processRepo(
    repo: string,
    files: FetchFile[],
    cwd: string,
    sync = false,
    branch = 'main',
  ): Promise<{
    repo: string
    results: FileSyncResult[]
    success: boolean
  }> {
    // Read tracker config once at the beginning
    const trackerConfig = readTrackerConfig(cwd)
    // Check if we need to sync by getting the latest commit hash
    let shouldFetch = true
    let latestCommitHash = ''

    if (sync) {
      try {
        // Get the latest commit hash from the repository
        logger.info(`Checking for updates in repository ${repo} (branch: ${branch})`)
        latestCommitHash = getLatestCommitHash(repo, branch)

        // Check if we need to sync
        // shouldFetch = needsSync(cwd, repo, branch, latestCommitHash)
        shouldFetch = true

        if (!shouldFetch) {
          logger.info(`Repository ${repo} is already up to date, skipping fetch`)
          return {
            repo,
            results: [],
            success: true,
          }
        }

        logger.info(`Updates found in repository ${repo}, proceeding with fetch`)
      } catch (e) {
        logger.warn(`Failed to check for updates in repository ${repo}: ${(e as Error).message}`)
        // If we fail to check for updates, we'll fetch anyway
        shouldFetch = true
      }
    }

    // Create a temporary directory for the repository
    // Download the repository and get cleanup function
    const { tempDir, cleanup } = downloadRepository(repo, branch)

    // Variable to store file data from sync operations
    let fileData: Record<string, Record<string, { hash: string; syncedAt: string; action: string }>> = {}

    // Track if we're in an error state to avoid updating sync data after errors
    let hasError = false

    try {
      // Collect file sync operations
      const syncOperations: FileSyncOperation[] = []

      // Process each file in the repository
      for (const file of files) {
        const { source, local } = file

        // Replace variables in paths
        const processedSource = context.replaceVariables(source)
        const processedLocal = context.replaceVariables(local)

        // Create clean paths for source and destination
        const normalizedSource = normalize(processedSource).replace(/^\/+/, '')
        const sourcePath = join(tempDir, normalizedSource)
        const localPath = join(cwd, processedLocal)

        // Ensure local directory exists
        const localDir = dirname(localPath)
        if (!existsSync(localDir)) {
          mkdirSync(localDir, { recursive: true })
        }

        try {
          const processFile = () => {
            const relativeSourcePath = relative(tempDir, sourcePath)
            const relativeLocalPath = relative(cwd, localPath)

            syncOperations.push({
              sourcePath,
              localPath,
              repo,
              relativeSourcePath,
              relativeLocalPath,
            })
          }

          // Process based on whether it's a file or directory
          const stats = statSync(sourcePath)
          if (stats.isDirectory()) {
            syncDirectoryChanges(sourcePath, localPath, syncOperations, tempDir, cwd, repo)
          } else {
            processFile()
          }
        } catch (e) {
          throw new Error(`Failed to process from ${repo}/${normalizedSource} (relative path): ${(e as Error).message}`)
        }
      }

      // Execute all file sync operations in batch and get updated file data and results
      const syncResult = await executeSyncOperations(syncOperations, trackerConfig, latestCommitHash)
      fileData = syncResult.updatedFiles

      // Generate and log repository-level summary
      const repoSummary = generateSyncSummary(syncResult.results)
      logSyncSummary(repoSummary, true, repo)

      // Return the results from this repo processing
      return {
        repo,
        results: syncResult.results,
        success: repoSummary.failCount === 0,
      }
    } catch (error) {
      // Handle any errors during processing
      logger.error(`Error processing repository ${repo}: ${(error as Error).message}`)
      hasError = true
      return {
        repo,
        results: [],
        success: false,
      }
    } finally {
      // Clean up temporary directory
      cleanup()

      // Update sync data if sync is enabled and we have a commit hash
      // Only update if there were no errors during processing
      if (sync && latestCommitHash && !hasError) {
        logger.info(`Updating sync data for repository ${repo}`)

        // Update the tracker config we already have

        // Make sure the repo entry exists with updated commit hash
        if (!trackerConfig.repos[repo]) {
          trackerConfig.repos[repo] = {
            repo,
            branch,
            lastCommitHash: latestCommitHash,
            syncedAt: new Date().toISOString(),
            files: {},
          }
        } else {
          // Update the commit hash and synced time
          trackerConfig.repos[repo].lastCommitHash = latestCommitHash
          trackerConfig.repos[repo].syncedAt = new Date().toISOString()
        }

        // If we have updated file data from sync operations, update them in the tracker
        if (fileData && fileData[repo] && Object.keys(fileData[repo] || {}).length > 0) {
          // Update file data in the tracker config
          for (const [filePath, fileInfo] of Object.entries(fileData[repo])) {
            trackerConfig.repos[repo].files[filePath] = {
              hash: fileInfo.hash,
              syncedAt: fileInfo.syncedAt,
              action: fileInfo.action,
            }
          }

          // Remove any existing redundant path properties
          if (trackerConfig.repos[repo] && trackerConfig.repos[repo].files) {
            for (const filePath in trackerConfig.repos[repo].files) {
              const fileData = trackerConfig.repos[repo].files[filePath] as unknown as Record<string, unknown>
              if (fileData && fileData.path) {
                delete fileData.path
              }
            }
          }
        }

        // Write the updated tracker config
        writeTrackerConfig(cwd, trackerConfig)
      }
    }
  }
}
