import { logger } from '../../logger'
import { context } from '../../context'
import { existsSync, mkdirSync, statSync } from 'fs'
import { dirname, join, normalize, relative } from 'path'
import { readTrackerConfig, writeTrackerConfig, TrackerConfig } from '../tracker'
import {
  getLatestCommitHash,
  downloadRepository,
  FileSyncOperation,
  executeSyncOperations,
  FileSyncResult,
  generateSyncSummary,
  logSyncSummary,
  syncDirectoryChanges,
  handleDeletedFiles,
} from '.'

/**
 * Represents a file or directory to be fetched from a GitHub repository
 */
export interface FetchFile {
  /** Source path within the repository (relative path) */
  source: string
  /** Local path on the filesystem (relative path) */
  local: string
}

/**
 * Represents a GitHub repository with a list of files/directories to fetch
 */
export interface RepoGroup {
  /** GitHub repository in the format 'owner/repo' */
  repo: string
  /** List of files/directories to fetch from this repository */
  files: FetchFile[]
  /** Whether to sync this repository (track commits and only fetch if there are changes) */
  sync?: boolean
  /** Branch to fetch from (defaults to main) */
  branch?: string
  /** Force fetch even if no changes are detected (defaults to false) */
  force?: boolean
  /** Optional fork repository to use instead of the main repo */
  forkRepo?: string
}

/**
 * Process a repository by downloading it once and extracting all files
 * @param repoGroup The repository group configuration
 * @param cwd The current working directory
 * @returns Object containing sync results and status
 */
export async function processRepo(
  repoGroup: RepoGroup,
  cwd: string
): Promise<{
  repo: string
  results: FileSyncResult[]
  success: boolean
}> {
  // Get the repo properties, but use the original repoGroup for everything else
  const { repo, branch = 'main', sync = false, force = false, forkRepo } = repoGroup

  // Read tracker config once at the beginning
  const trackerConfig = readTrackerConfig(cwd)

  // Check if we need to sync by getting the latest commit hash
  const shouldFetchResult = await checkIfShouldFetch(repo, branch, sync, force, trackerConfig)

  if (!shouldFetchResult.shouldFetch) {
    logger.info(`Repository ${repo} is already up to date, skipping fetch`)
    return {
      repo,
      results: [],
      success: true,
    }
  }

  const latestCommitHash = shouldFetchResult.latestCommitHash

  // Create a temporary directory for the repository
  // Download the repository and get cleanup function
  const { tempDir, cleanup } = downloadRepository(repo, branch)

  // Variable to store file data from sync operations
  let fileData: Record<
    string,
    Record<string, { hash: string; syncedAt: string; action: string; relativeSourcePath: string }>
  > = {}

  // Track if we're in an error state to avoid updating sync data after errors
  let hasError = false

  try {
    // Process files and collect sync operations
    const syncOperations = collectSyncOperations(repoGroup.files, tempDir, cwd, repo)

    // Execute all file sync operations in batch and get updated file data and results
    const syncResult = await executeSyncOperations(syncOperations, trackerConfig, latestCommitHash)
    fileData = syncResult.updatedFiles

    // Handle files that were deleted in source but exist in local
    // This is done after the main sync to ensure we have all source files first
    for (const file of repoGroup.files) {
      const processedSource = context.replaceVariables(file.source)
      const processedLocal = context.replaceVariables(file.local)

      const normalizedSource = normalize(processedSource).replace(/^\/+/, '')
      const sourcePath = join(tempDir, normalizedSource)
      const localPath = join(cwd, processedLocal)

      // Only process directories for deletion check
      if (existsSync(sourcePath) && statSync(sourcePath).isDirectory()) {
        const removedFiles = await handleDeletedFiles(sourcePath, localPath, cwd, repo)
        if (removedFiles.length > 0) {
          logger.info(
            `Removed ${removedFiles.length} files from ${repo} that were deleted in source`
          )
        }
      }
    }

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
    if (sync && latestCommitHash && !hasError) {
      updateTrackerWithLatestData(
        repo,
        branch,
        latestCommitHash,
        fileData,
        trackerConfig,
        cwd,
        repoGroup.files,
        forkRepo
      )
    }
  }
}

/**
 * Checks if a repository should be fetched based on commit hash comparison
 */
async function checkIfShouldFetch(
  repo: string,
  branch: string,
  sync: boolean,
  force: boolean,
  trackerConfig: TrackerConfig
): Promise<{ shouldFetch: boolean; latestCommitHash: string }> {
  let shouldFetch = true
  let latestCommitHash = ''

  // Always get the latest commit hash for tracking purposes
  try {
    logger.info(`Checking for updates in repository ${repo} (branch: ${branch})`)
    latestCommitHash = getLatestCommitHash(repo, branch)

    // Only check if we should fetch when sync is enabled and force is disabled
    if (sync && !force) {
      // Check if we need to sync by comparing with the last synced commit hash
      const repoData = trackerConfig.repos[repo]
      const lastSyncedCommit = repoData?.branch === branch ? repoData.lastCommitHash : null
      shouldFetch = !lastSyncedCommit || lastSyncedCommit !== latestCommitHash

      if (!shouldFetch) {
        return { shouldFetch, latestCommitHash }
      }

      logger.info(`Updates found in repository ${repo}, proceeding with fetch`)
    } else if (force) {
      logger.info(
        `Force option enabled for repository ${repo}, proceeding with fetch regardless of updates`
      )
    }
  } catch (e) {
    logger.warn(`Failed to check for updates in repository ${repo}: ${(e as Error).message}`)
    // If we fail to check for updates, we'll fetch anyway
    shouldFetch = true
  }

  return { shouldFetch, latestCommitHash }
}

/**
 * Collects sync operations for all files in a repository
 */
function collectSyncOperations(
  files: FetchFile[],
  tempDir: string,
  cwd: string,
  repo: string
): FileSyncOperation[] {
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
      processSingleFile(sourcePath, localPath, tempDir, cwd, repo, syncOperations)
    } catch (e) {
      throw new Error(
        `Failed to process from ${repo}/${normalizedSource} (relative path): ${(e as Error).message}`
      )
    }
  }

  return syncOperations
}

/**
 * Process a single file or directory for syncing
 */
function processSingleFile(
  sourcePath: string,
  localPath: string,
  tempDir: string,
  cwd: string,
  repo: string,
  syncOperations: FileSyncOperation[]
): void {
  // Process based on whether it's a file or directory
  const stats = statSync(sourcePath)

  if (stats.isDirectory()) {
    syncDirectoryChanges(sourcePath, localPath, syncOperations, tempDir, cwd, repo)
  } else {
    addFileToSyncOperations(sourcePath, localPath, tempDir, cwd, repo, syncOperations)
  }
}

/**
 * Adds a single file to the sync operations list
 */
function addFileToSyncOperations(
  sourcePath: string,
  localPath: string,
  tempDir: string,
  cwd: string,
  repo: string,
  syncOperations: FileSyncOperation[]
): void {
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

/**
 * Updates the tracker with the latest repository data
 */
function updateTrackerWithLatestData(
  repo: string,
  branch: string,
  latestCommitHash: string,
  fileData: Record<
    string,
    Record<string, { hash: string; syncedAt: string; action: string; relativeSourcePath: string }>
  >,
  trackerConfig: TrackerConfig,
  cwd: string,
  filePaths: FetchFile[],
  forkRepo?: string
): void {
  logger.info(`Updating sync data for repository ${repo}`)

  // Make sure the repo entry exists with updated commit hash
  if (!trackerConfig.repos[repo]) {
    trackerConfig.repos[repo] = {
      branch,
      lastCommitHash: latestCommitHash,
      syncedAt: new Date().toISOString(),
      filePaths,
      files: {},
    }
    // Add forkRepo if provided
    if (forkRepo) {
      trackerConfig.repos[repo].forkRepo = forkRepo
    }
  } else {
    // Update the commit hash and synced time
    trackerConfig.repos[repo].lastCommitHash = latestCommitHash
    trackerConfig.repos[repo].syncedAt = new Date().toISOString()
    trackerConfig.repos[repo].filePaths = filePaths

    // Update forkRepo if provided
    if (forkRepo) {
      trackerConfig.repos[repo].forkRepo = forkRepo
    }
  }

  // If we have updated file data from sync operations, update them in the tracker
  if (fileData && fileData[repo] && Object.keys(fileData[repo] || {}).length > 0) {
    // Update file data in the tracker config
    for (const [filePath, fileInfo] of Object.entries(fileData[repo])) {
      trackerConfig.repos[repo].files[filePath] = {
        hash: fileInfo.hash,
        syncedAt: fileInfo.syncedAt,
        action: fileInfo.action,
        relativeSourcePath: fileInfo.relativeSourcePath,
      }
    }

    // Remove any existing redundant path properties
    if (trackerConfig.repos[repo]?.files) {
      for (const filePath in trackerConfig.repos[repo].files) {
        const fileData = trackerConfig.repos[repo].files[filePath] as unknown as Record<
          string,
          unknown
        >
        if (fileData && fileData.path) {
          delete fileData.path
        }
      }
    }
  }

  // Write the updated tracker config
  writeTrackerConfig(cwd, trackerConfig)
}
