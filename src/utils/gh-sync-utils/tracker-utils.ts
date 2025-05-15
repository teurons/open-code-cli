import { logger } from '../../logger'
import { writeTrackerConfig, TrackerConfig, RepoSyncData, FileSyncData } from '../tracker'
import { RepoGroup, FetchFile } from './gh-sync-repo'

/**
 * Always updates the tracker file structure from the current workflow configuration
 * while preserving existing data like file hashes and commit hashes
 * @param repoGroup Current repository configuration
 * @param trackerConfig Tracker configuration
 * @param cwd Current working directory
 * @returns Always returns true since we always update the tracker
 */
export function updateTrackerStructure(
  repoGroup: RepoGroup,
  trackerConfig: TrackerConfig,
  cwd: string
): boolean {
  const { repo, branch = 'main', forkRepo } = repoGroup
  const trackerData = trackerConfig.repos[repo]

  // If no tracker data exists, create a new entry
  if (!trackerData) {
    logger.info(`Creating new tracker entry for repository ${repo}`)

    trackerConfig.repos[repo] = {
      branch,
      lastCommitHash: '',
      syncedAt: new Date().toISOString(),
      filePaths: repoGroup.files,
      files: {},
      ...(forkRepo ? { forkRepo } : {}),
    }
  } else {
    // Always update the tracker structure while preserving existing data
    logger.info(`Updating tracker structure for repository ${repo}`)

    // Generate the new structure
    const newStructure = generateRepoStructure(repoGroup, trackerData)

    // Preserve existing data but use the new structure
    trackerConfig.repos[repo] = {
      ...newStructure,
      lastCommitHash: trackerData.lastCommitHash || '',
      syncedAt: new Date().toISOString(),
      files: preserveFileData(trackerData.files || {}, newStructure.filePaths),
    }
  }

  // Always write the updated tracker config
  writeTrackerConfig(cwd, trackerConfig)
  return true
}

/**
 * Generates a repository structure from the current workflow configuration
 * @param repoGroup Current repository configuration
 * @param trackerData Existing tracker data (if any)
 * @returns A structured repository object
 */
function generateRepoStructure(
  repoGroup: RepoGroup,
  trackerData?: RepoSyncData
): Omit<RepoSyncData, 'lastCommitHash' | 'syncedAt' | 'files'> {
  const { branch = 'main', forkRepo } = repoGroup

  return {
    branch,
    filePaths: repoGroup.files,
    ...(forkRepo ? { forkRepo } : {}),
    // Include pullRequest if it exists in the tracker data
    ...(trackerData?.pullRequest ? { pullRequest: trackerData.pullRequest } : {}),
  }
}

/**
 * Preserves existing file data while adapting to the new file paths structure
 * @param existingFiles Existing file data from the tracker
 * @param newFilePaths New file paths from the current workflow
 * @returns Updated file data structure
 */
function preserveFileData(
  existingFiles: Record<string, FileSyncData>,
  newFilePaths: FetchFile[]
): Record<string, FileSyncData> {
  // Start with existing files
  const updatedFiles = { ...existingFiles }

  // Ensure all new file paths have entries, even if empty
  for (const filePath of newFilePaths) {
    const localPath = filePath.local

    // If this file doesn't exist in the tracker yet, create an empty entry
    if (!updatedFiles[localPath]) {
      updatedFiles[localPath] = {
        hash: '',
        syncedAt: '',
        relativeSourcePath: filePath.source,
      }
    }
    // If it exists but doesn't have relativeSourcePath, add it
    else if (!updatedFiles[localPath].relativeSourcePath) {
      updatedFiles[localPath].relativeSourcePath = filePath.source
    }
  }

  return updatedFiles
}
