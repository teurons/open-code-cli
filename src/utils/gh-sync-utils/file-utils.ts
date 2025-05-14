import { createHash } from 'crypto'
import { existsSync, readFileSync, mkdirSync, readdirSync, unlinkSync } from 'fs'
import { join, relative } from 'path'
import { logger } from '../../logger'
import { TrackerConfig, readTrackerConfig } from '../tracker'
import { FileAction, FileActionResult, FileSyncOperation } from './types'

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
 * Determine what action should be taken for a file during sync
 * @param sourcePath Source file path
 * @param localPath Local file path
 * @param repo Repository name
 * @param relativeLocalPath Relative file path for tracking
 * @param trackerConfig Tracker configuration
 * @returns Object containing the action to take and all relevant file hashes
 */
export function actionOnFile(
  sourcePath: string,
  localPath: string,
  repo: string,
  relativeLocalPath: string,
  trackerConfig: TrackerConfig,
  sourceCommitHash?: string
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

  // 3. Get hash and action of localFile from tracker
  const trackerFileHash = trackerConfig.repos[repo]?.files?.[relativeLocalPath]?.hash || null
  const trackerAction = trackerConfig.repos[repo]?.files?.[relativeLocalPath]?.action || null

  // 4. Get last commit hash from tracker and use sourceCommitHash if provided
  const lastCommitHash = trackerConfig.repos[repo]?.lastCommitHash || null
  const currentCommitHash = sourceCommitHash || lastCommitHash || null

  // Special handling for files that were previously merged
  if (trackerAction === FileAction.MERGE) {
    // If the file was previously merged, we should never copy it
    // Instead, we should either merge again or do nothing based on commit hash

    // If commit hash hasn't changed, no action needed regardless of file hash changes
    if (lastCommitHash === currentCommitHash) {
      return {
        action: FileAction.NONE,
        sourceFileHash,
        localFileHash,
        trackerFileHash,
      }
    }

    // If commit hash has changed, we need to merge again
    // This overrides the normal hash-based logic below
    return {
      action: FileAction.MERGE,
      sourceFileHash,
      localFileHash,
      trackerFileHash,
    }
  }

  // If we don't have tracking data yet
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

  // If localFileHash !== trackerFileHash && localFileHash === sourceFileHash
  // It means file changes of local have been pushed to source
  if (localFileHash !== trackerFileHash && localFileHash === sourceFileHash) {
    return {
      action: FileAction.COPY,
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
 * Synchronize a directory by collecting file operations
 * @param sourceDir Source directory path (absolute path)
 * @param localDir Local directory path (absolute path)
 * @param syncOps Array to collect sync operations
 * @param tempDir Temporary directory path (absolute path, optional)
 * @param cwd Current working directory (absolute path, optional)
 * @param repo Repository name (optional)
 */
/**
 * Identify and handle files that exist in local but not in source
 * @param sourceDir Source directory path (absolute path)
 * @param localDir Local directory path (absolute path)
 * @param cwd Current working directory for relative path calculation
 * @param repo Repository name to check tracked files
 * @returns Array of file paths that were removed
 */
export async function handleDeletedFiles(
  sourceDir: string,
  localDir: string,
  cwd?: string,
  repo?: string
): Promise<string[]> {
  const removedFiles: string[] = []

  // Skip if local directory doesn't exist
  if (!existsSync(localDir)) {
    return removedFiles
  }

  // Get all files in source directory (recursively)
  const sourceFiles = new Set<string>()
  const collectSourceFiles = (dir: string, basePath: string) => {
    if (!existsSync(dir)) return

    readdirSync(dir, { withFileTypes: true }).forEach(entry => {
      const fullPath = join(dir, entry.name)
      const relativePath = relative(basePath, fullPath)

      if (entry.isDirectory()) {
        collectSourceFiles(fullPath, basePath)
      } else {
        sourceFiles.add(relativePath)
      }
    })
  }

  // Collect all source files
  collectSourceFiles(sourceDir, sourceDir)

  // Get tracker data if repo is provided
  let trackedFiles: Set<string> | null = null
  if (repo && cwd) {
    const trackerConfig = readTrackerConfig(cwd)
    if (trackerConfig.repos[repo] && trackerConfig.repos[repo].files) {
      trackedFiles = new Set<string>(Object.keys(trackerConfig.repos[repo].files))
    }
  }

  // Collect files to be deleted (files in local but not in source)
  const filesToDelete: { path: string; relativePath: string }[] = []

  const collectFilesToDelete = (dir: string, basePath: string) => {
    if (!existsSync(dir)) return

    readdirSync(dir, { withFileTypes: true }).forEach(entry => {
      const fullPath = join(dir, entry.name)
      const relativePath = relative(basePath, fullPath)

      if (entry.isDirectory()) {
        collectFilesToDelete(fullPath, basePath)
      } else {
        // If file exists in local but not in source, add to deletion list
        if (!sourceFiles.has(relativePath)) {
          const relativeToRoot = cwd ? relative(cwd, fullPath) : fullPath

          // Only consider tracked files if repo is provided
          const isTracked = !trackedFiles || trackedFiles.has(relativeToRoot)

          if (isTracked) {
            filesToDelete.push({
              path: fullPath,
              relativePath: relativeToRoot,
            })
          }
        }
      }
    })
  }

  // Collect all files to be deleted
  collectFilesToDelete(localDir, localDir)

  // If no files to delete, return early
  if (filesToDelete.length === 0) {
    return removedFiles
  }

  // Prompt user with options
  logger.info(`Found ${filesToDelete.length} files that exist locally but were deleted in source.`)

  const deleteOption = await logger.prompt('How would you like to handle deleted files?', {
    type: 'select',
    options: ['Delete all files', 'Select files to delete', 'Keep all files'],
  })

  if (deleteOption === 'Keep all files') {
    logger.info('No files were deleted.')
    return removedFiles
  }

  let filesToRemove: { path: string; relativePath: string }[] = []

  if (deleteOption === 'Delete all files') {
    filesToRemove = filesToDelete
  } else if (deleteOption === 'Select files to delete') {
    // Prepare options for multiselect
    const options = filesToDelete.map(file => file.relativePath)

    const selectedFiles = await logger.prompt('Select files to delete:', {
      type: 'multiselect',
      options,
    })

    if (Array.isArray(selectedFiles) && selectedFiles.length > 0) {
      // Filter files based on selection
      filesToRemove = filesToDelete.filter(file => selectedFiles.includes(file.relativePath))
    } else {
      logger.info('No files selected for deletion.')
      return removedFiles
    }
  }

  // Delete the selected files
  for (const file of filesToRemove) {
    try {
      unlinkSync(file.path)
      logger.info(`Removed file that was deleted in source: ${file.relativePath}`)
      removedFiles.push(file.relativePath)
    } catch (e) {
      logger.warn(`Failed to remove file ${file.path}: ${(e as Error).message}`)
    }
  }

  // Clean up empty directories
  const cleanEmptyDirs = (dir: string) => {
    if (!existsSync(dir)) return

    try {
      const entries = readdirSync(dir)

      // Recursively check subdirectories first
      for (const entry of entries) {
        const fullPath = join(dir, entry)
        if (existsSync(fullPath) && readdirSync(fullPath, { withFileTypes: true }).some(e => e.isDirectory())) {
          cleanEmptyDirs(fullPath)
        }
      }

      // Check if directory is now empty after potential subdirectory cleanup
      const remaining = readdirSync(dir)
      if (remaining.length === 0) {
        unlinkSync(dir)
        const relativeDir = cwd ? relative(cwd, dir) : dir
        logger.info(`Removed empty directory: ${relativeDir}`)
      }
    } catch (e) {
      // Ignore errors when trying to remove directories
    }
  }

  // Clean up empty directories
  cleanEmptyDirs(localDir)

  return removedFiles
}

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
