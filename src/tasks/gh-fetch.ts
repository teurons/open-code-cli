import { Task, TaskContext } from './types'
import { TaskConfig as CommonTaskConfig } from '../types/common'
import { logger } from '../logger'
import { context } from '../context'
import { existsSync, mkdirSync, statSync, readdirSync } from 'fs'
import { dirname, join, normalize, relative } from 'path'
import { needsSync, updateRepoSyncData } from '../utils/tracker'
import {
  validateDependencies,
  validateReposConfiguration,
  validateRepositoryGroup,
  validateGhFetchConfig,
  getLatestCommitHash,
  downloadRepository,
  FileSyncOperation,
  executeSyncOperations,
} from '../utils/gh-fetch-utils'

/**
 * Represents a file or directory to be fetched from a GitHub repository
 */
interface FetchFile {
  /** Source path within the repository */
  source: string
  /** Destination path on the local filesystem */
  destination: string
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

export class GhFetchTask implements Task {
  /**
   * Execute the GitHub fetch task
   * @param taskContext The task context containing configuration and working directory
   */
  public async execute(taskContext: TaskContext): Promise<void> {
    const { repos, depends } = taskContext.config
    const { cwd } = taskContext

    // Check dependencies and validate repos configuration
    validateDependencies(depends)
    validateReposConfiguration(repos as unknown[])

    const typedRepos = repos as unknown[]

    // Process each repository group directly
    for (const repoGroup of typedRepos) {
      const { repo, files, sync = false, branch = 'main' } = repoGroup as RepoGroup

      // Validate repository group structure
      validateRepositoryGroup(repo, files)

      // Replace variables in repo name
      const processedRepo = context.replaceVariables(repo)

      // Process this repository
      await this.processRepo(processedRepo, files, cwd, sync, branch)
    }
  }

  // Using imported utility functions directly

  /**
   * Sync directory changes by collecting file operations
   * @param sourceDir Source directory path
   * @param destDir Destination directory path
   * @param syncOps Array to collect sync operations
   */
  private syncDirectoryChanges(sourceDir: string, destDir: string, syncOps: FileSyncOperation[], tempDir?: string, cwd?: string): void {
    // Create destination directory if needed
    if (!existsSync(destDir)) {
      mkdirSync(destDir, { recursive: true })
    }

    try {
      // Process each entry in the directory
      readdirSync(sourceDir, { withFileTypes: true }).forEach(entry => {
        const sourcePath = join(sourceDir, entry.name)
        const destPath = join(destDir, entry.name)

        if (entry.isDirectory()) {
          // Recursively process subdirectory
          this.syncDirectoryChanges(sourcePath, destPath, syncOps, tempDir, cwd)
        } else {
          // Add file to sync operations
          const relativeSourcePath = tempDir ? relative(tempDir, sourcePath) : relative(sourceDir, sourcePath)
          const relativeDestPath = cwd ? relative(cwd, destPath) : relative(destDir, destPath)
          
          syncOps.push({
            sourcePath,
            destPath,
            displaySource: relative(sourceDir, sourcePath),
            processedDestination: destPath,
            repo: '',
            relativeSourcePath,
            relativeDestPath
          })
        }
      })
    } catch (e) {
      logger.warn(`Error syncing directory ${sourceDir}: ${(e as Error).message}`)
    }
  }

  /**
   * Process a repository by downloading it once and extracting all files
   * @param repo The repository name (owner/repo)
   * @param files The files to extract from the repository
   * @param cwd The current working directory
   * @param sync Whether to sync this repository (track commits and only fetch if there are changes)
   * @param branch Branch to fetch from
   */
  private async processRepo(
    repo: string,
    files: FetchFile[],
    cwd: string,
    sync = false,
    branch = 'main',
  ): Promise<void> {
    // Check if we need to sync by getting the latest commit hash
    let shouldFetch = true
    let latestCommitHash = ''

    if (sync) {
      try {
        // Get the latest commit hash from the repository
        logger.info(`Checking for updates in repository ${repo} (branch: ${branch})`)
        latestCommitHash = getLatestCommitHash(repo, branch)

        // Check if we need to sync
        shouldFetch = needsSync(cwd, repo, branch, latestCommitHash)

        if (!shouldFetch) {
          logger.info(`Repository ${repo} is already up to date, skipping fetch`)
          return
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

    try {
      // Collect file sync operations
      const syncOperations: FileSyncOperation[] = []

      // Process each file in the repository
      for (const file of files) {
        const { source, destination } = file

        // Replace variables in paths
        const processedSource = context.replaceVariables(source)
        const processedDestination = context.replaceVariables(destination)

        // Create clean paths for source and destination
        const normalizedSource = normalize(processedSource).replace(/^\/+/, '')
        const sourcePath = join(tempDir, normalizedSource)
        const destPath = join(cwd, processedDestination)
        
        // Ensure destination directory exists
        const destDir = dirname(destPath)
        if (!existsSync(destDir)) {
          mkdirSync(destDir, { recursive: true })
        }
        
        try {
          const processFile = () => {
            const relativeSourcePath = relative(tempDir, sourcePath)
            const relativeDestPath = relative(cwd, destPath)
            
            syncOperations.push({
              sourcePath,
              destPath,
              displaySource: normalizedSource === '' ? '/' : normalizedSource,
              processedDestination,
              repo,
              relativeSourcePath,
              relativeDestPath
            })
          }
          
          // Process based on whether it's a file or directory
          const stats = statSync(sourcePath)
          stats.isDirectory() 
            ? this.syncDirectoryChanges(sourcePath, destPath, syncOperations, tempDir, cwd)
            : processFile()
        } catch (e) {
          throw new Error(`Failed to process from ${repo}/${normalizedSource}: ${(e as Error).message}`)
        }
      }

      // Execute all file sync operations in batch
      executeSyncOperations(syncOperations)
    } finally {
      // Clean up temporary directory
      cleanup()

      // Update sync data if sync is enabled and we have a commit hash
      if (sync && latestCommitHash) {
        updateRepoSyncData(cwd, repo, branch, latestCommitHash)
        logger.info(`Updated sync data for repository ${repo}`)
      }
    }
  }

  /**
   * Validate the task configuration
   * @param config The task configuration to validate
   * @returns True if the configuration is valid, false otherwise
   */
  public validate(config: CommonTaskConfig): boolean {
    return validateGhFetchConfig(config)
  }
}
