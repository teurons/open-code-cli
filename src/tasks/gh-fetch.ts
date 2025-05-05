import { Task, TaskContext } from './types'
import { logger } from '../logger'
import { context } from '../context'
import { execSync } from 'child_process'
import { existsSync, mkdirSync, copyFileSync, cpSync, statSync } from 'fs'
import { dirname, join } from 'path'
import { tmpdir } from 'os'
import { randomUUID } from 'crypto'

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
      const { repo, files } = repoGroup as RepoGroup

      // Validate repository group structure
      if (!repo || !files || !Array.isArray(files)) {
        throw new Error('Invalid repository group: repo and files array are required')
      }

      // Replace variables in repo name
      const processedRepo = context.replaceVariables(repo)

      // Process this repository
      await this.processRepo(processedRepo, files, cwd)
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
    return `"${arg.replace(/"/g, '\\"')}"`
  }

  /**
   * Process a repository by downloading it once and extracting all files
   * @param repo The repository name (owner/repo)
   * @param files The files to extract from the repository
   * @param cwd The current working directory
   */
  private async processRepo(repo: string, files: FetchFile[], cwd: string): Promise<void> {
    // Create a temporary directory for the repository
    const tempDir = join(tmpdir(), `gh-fetch-${randomUUID()}`)
    mkdirSync(tempDir, { recursive: true })

    try {
      // Download the entire repository once
      logger.info(`Downloading repository ${repo} to temporary directory`)
      const gigetCommand = `npx giget gh:${repo} ${this.escapeShellArg(tempDir)} --force`
      execSync(gigetCommand, { stdio: 'inherit', cwd: process.cwd() })

      // Process each file in the repository
      for (const file of files) {
        const { source, destination } = file

        // Replace variables in paths
        const processedSource = context.replaceVariables(source)
        const processedDestination = context.replaceVariables(destination)

        const sourcePath = join(tempDir, processedSource)
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
            logger.info(`Processing directory from ${repo}/${processedSource} to ${processedDestination}`)
            // Copy directory
            cpSync(sourcePath, destPath, { recursive: true })
          } else {
            logger.info(`Processing file from ${repo}/${processedSource} to ${processedDestination}`)
            // Copy file
            copyFileSync(sourcePath, destPath)
          }

          logger.success(`Successfully fetched to ${processedDestination}`)
        } catch (e) {
          throw new Error(`Failed to process from ${repo}/${processedSource}: ${(e as Error).message}`)
        }
      }
    } finally {
      // Clean up temporary directory
      try {
        execSync(`rm -rf ${this.escapeShellArg(tempDir)}`, { stdio: 'inherit' })
      } catch (e) {
        logger.warn(`Failed to clean up temporary directory: ${(e as Error).message}`)
      }
    }
  }

  /**
   * Validate the task configuration
   * @param config The task configuration to validate
   * @returns True if the configuration is valid, false otherwise
   */
  public validate(config: Record<string, any>): boolean {
    // Configuration is valid if repos is an array of repository groups
    return (
      Array.isArray(config.repos) &&
      config.repos.every(
        (repoGroup: any) =>
          typeof repoGroup === 'object' &&
          typeof repoGroup.repo === 'string' &&
          Array.isArray(repoGroup.files) &&
          repoGroup.files.every(
            (file: any) =>
              typeof file === 'object' && typeof file.source === 'string' && typeof file.destination === 'string',
          ),
      )
    )
  }
}
