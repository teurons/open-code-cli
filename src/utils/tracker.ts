import fs from 'fs'
import path from 'path'
import { logger } from '../logger'

// Tracker file name
const TRACKER_FILENAME = 'open-code-cli.tracker.json'

/**
 * Interface for file sync tracking data
 */
interface FileSyncData {
  hash: string
  lastSyncedAt: string
}

/**
 * Interface for repository sync tracking data
 */
interface RepoSyncData {
  repo: string
  branch: string
  lastCommitHash: string
  lastSyncedAt: string
  files: Record<string, FileSyncData>
}

/**
 * Interface for the tracker file structure
 */
interface TrackerConfig {
  repos: Record<string, RepoSyncData>
}

/**
 * Checks if a tracker file exists in the specified directory
 */
export function trackerExists(directory: string): boolean {
  const trackerPath = path.join(directory, TRACKER_FILENAME)
  return fs.existsSync(trackerPath)
}

/**
 * Reads the tracker configuration from the specified directory
 */
export function readTrackerConfig(directory: string): TrackerConfig {
  const trackerPath = path.join(directory, TRACKER_FILENAME)

  if (!fs.existsSync(trackerPath)) {
    return { repos: {} }
  }

  try {
    const trackerData = fs.readFileSync(trackerPath, 'utf-8')
    return JSON.parse(trackerData) as TrackerConfig
  } catch (error) {
    logger.warn(`Failed to read tracker configuration: ${(error as Error).message}`)
    return { repos: {} }
  }
}

/**
 * Writes the tracker configuration to the specified directory
 */
export function writeTrackerConfig(directory: string, config: TrackerConfig): void {
  const trackerPath = path.join(directory, TRACKER_FILENAME)

  try {
    fs.writeFileSync(trackerPath, JSON.stringify(config, null, 2))
  } catch (error) {
    logger.error(`Failed to write tracker configuration: ${(error as Error).message}`)
    throw error
  }
}

/**
 * Updates the sync data for a repository
 */
export function updateRepoSyncData(directory: string, repo: string, branch: string, commitHash: string): void {
  const config = readTrackerConfig(directory)

  // Preserve existing file data if it exists
  const existingFiles = config.repos[repo]?.files || {}

  config.repos[repo] = {
    repo,
    branch,
    lastCommitHash: commitHash,
    lastSyncedAt: new Date().toISOString(),
    files: existingFiles,
  }

  writeTrackerConfig(directory, config)
}

/**
 * Gets the last synced commit hash for a repository
 * Returns null if the repository hasn't been synced before
 */
export function getLastSyncedCommit(directory: string, repo: string, branch: string): string | null {
  const config = readTrackerConfig(directory)

  const repoData = config.repos[repo]
  if (!repoData || repoData.branch !== branch) {
    return null
  }

  return repoData.lastCommitHash
}

/**
 * Checks if a repository needs to be synced by comparing the latest commit hash
 * with the last synced commit hash
 */
export function needsSync(directory: string, repo: string, branch: string, latestCommitHash: string): boolean {
  const lastSyncedCommit = getLastSyncedCommit(directory, repo, branch)

  // If never synced before or commit hash is different, sync is needed
  return !lastSyncedCommit || lastSyncedCommit !== latestCommitHash
}

// updateFileHash function removed as it's no longer needed - file hashes are now updated in batch

/**
 * Gets the last synced hash for a file
 * @param directory The directory containing the tracker file
 * @param repo The repository name
 * @param filePath The relative path of the file
 * @returns The last synced hash or null if not found
 */
export function getLastSyncedFileHash(directory: string, repo: string, filePath: string): string | null {
  const config = readTrackerConfig(directory)

  if (!config.repos[repo] || !config.repos[repo].files || !config.repos[repo].files[filePath]) {
    return null
  }

  return config.repos[repo].files[filePath].hash
}
