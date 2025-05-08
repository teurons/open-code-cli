import { Task, TaskContext } from './types'
import { TaskConfig as CommonTaskConfig } from '../types/common'
import { logger } from '../logger'
import { context } from '../context'
import { execSync } from 'child_process'
import { existsSync, mkdirSync, copyFileSync, cpSync, statSync, readFileSync, readdirSync } from 'fs'
import { dirname, join, normalize, relative } from 'path'
import { tmpdir } from 'os'
import { randomUUID } from 'crypto'
import { createHash } from 'crypto'
import { needsSync, updateRepoSyncData } from '../utils/tracker'

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

    // Check dependencies
    if (depends && Array.isArray(depends)) {
      for (const dep of depends) {
        if (!context.has(dep)) {
          throw new Error(`Missing dependency: ${dep}`)
        }
      }
    }

    // Validate repos configuration
    if (!repos || !Array.isArray(repos) || repos.length === 0) {
      throw new Error('No repositories provided. The repos field must be an array of repository groups.')
    }

    // Process each repository group directly
    for (const repoGroup of repos) {
      const { repo, files, sync = false, branch = 'main' } = repoGroup as RepoGroup

      // Validate repository group structure
      if (!repo || !files || !Array.isArray(files)) {
        throw new Error('Invalid repository group: repo and files array are required')
      }

      // Replace variables in repo name
      const processedRepo = context.replaceVariables(repo)

      // Process this repository
      await this.processRepo(processedRepo, files, cwd, sync, branch)
    }
  }

  /**
   * Escapes a string for safe use as a shell argument
   * Handles special characters like parentheses, spaces, etc.
   * @param arg The string to escape
   * @returns The escaped string
   */
  private escapeShellArg(arg: string): string {
    // For paths with special characters, we need to escape them properly
    // This handles parentheses, spaces, and other special shell characters
    return `"${arg.replace(/"/g, '\"')}"` // Fix double slash issue
  }

  /**
   * Calculate hash of a file for comparison
   * @param filePath Path to the file
   * @returns MD5 hash of the file contents
   */
  private getFileHash(filePath: string): string {
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
  private hasFileChanged(sourcePath: string, destPath: string): boolean {
    // If destination doesn't exist, it has changed
    if (!existsSync(destPath)) {
      return true
    }

    // Compare file hashes
    const sourceHash = this.getFileHash(sourcePath)
    const destHash = this.getFileHash(destPath)

    return sourceHash !== destHash
  }

  /**
   * Sync directory changes by comparing files and only copying changed ones
   * @param sourceDir Source directory path
   * @param destDir Destination directory path
   */
  private syncDirectoryChanges(sourceDir: string, destDir: string): void {
    // Create destination directory if it doesn't exist
    if (!existsSync(destDir)) {
      mkdirSync(destDir, { recursive: true })
    }

    try {
      // Get all files and directories in the source directory
      const entries = readdirSync(sourceDir, { withFileTypes: true })

      // Process each entry
      for (const entry of entries) {
        const sourcePath = join(sourceDir, entry.name)
        const destPath = join(destDir, entry.name)

        if (entry.isDirectory()) {
          // Recursively sync subdirectory
          this.syncDirectoryChanges(sourcePath, destPath)
        } else {
          // Copy file only if it has changed
          if (this.hasFileChanged(sourcePath, destPath)) {
            const relPath = relative(sourceDir, sourcePath)
            logger.info(`File changed: ${relPath}`)
            copyFileSync(sourcePath, destPath)
          }
        }
      }
    } catch (e) {
      logger.warn(`Error syncing directory ${sourceDir}: ${(e as Error).message}`)
      // Fall back to full directory copy on error
      cpSync(sourceDir, destDir, { recursive: true })
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
        latestCommitHash = execSync(`git ls-remote https://github.com/${repo}.git ${branch} | cut -f1`)
          .toString()
          .trim()

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
    const tempDir = join(tmpdir(), `gh-fetch-${randomUUID()}`)
    mkdirSync(tempDir, { recursive: true })

    try {
      // Download the entire repository once
      logger.info(`Downloading repository ${repo} to temporary directory`)
      const gigetCommand = `npx giget gh:${repo}#${branch} ${this.escapeShellArg(tempDir)} --force`
      execSync(gigetCommand, { stdio: 'inherit', cwd: process.cwd() })

      // Process each file in the repository
      for (const file of files) {
        const { source, destination } = file

        // Replace variables in paths
        const processedSource = context.replaceVariables(source)
        const processedDestination = context.replaceVariables(destination)

        // Normalize paths to avoid double slashes
        const normalizedSource = normalize(processedSource).replace(/^\/+/, '')
        const sourcePath = join(tempDir, normalizedSource)
        const destPath = join(cwd, processedDestination)

        // Ensure destination directory exists
        const destDir = dirname(destPath)
        if (!existsSync(destDir)) {
          mkdirSync(destDir, { recursive: true })
        }

        try {
          // Auto-detect if it's a file or directory
          const stats = statSync(sourcePath)

          if (stats.isDirectory()) {
            // Remove any leading slashes for display
            const displaySource = normalizedSource === '' ? '/' : normalizedSource
            logger.info(`Processing directory from ${repo}:${displaySource} to ${processedDestination}`)

            // Copy directory with intelligent change detection
            this.syncDirectoryChanges(sourcePath, destPath)
          } else {
            // Remove any leading slashes for display
            const displaySource = normalizedSource === '' ? '/' : normalizedSource
            logger.info(`Processing file from ${repo}:${displaySource} to ${processedDestination}`)

            // Copy file only if it has changed
            if (this.hasFileChanged(sourcePath, destPath)) {
              logger.info(`File has changed, copying: ${processedDestination}`)
              copyFileSync(sourcePath, destPath)
            } else {
              logger.info(`File unchanged, skipping: ${processedDestination}`)
            }
          }

          logger.success(`Successfully fetched to ${processedDestination}`)
        } catch (e) {
          throw new Error(`Failed to process from ${repo}/${normalizedSource}: ${(e as Error).message}`)
        }
      }
    } finally {
      // Clean up temporary directory
      try {
        execSync(`rm -rf ${this.escapeShellArg(tempDir)}`, { stdio: 'inherit' })
      } catch (e) {
        logger.warn(`Failed to clean up temporary directory: ${(e as Error).message}`)
      }

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
}
