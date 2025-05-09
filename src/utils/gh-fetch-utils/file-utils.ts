import { createHash } from 'crypto'
import { existsSync, readFileSync, mkdirSync, readdirSync } from 'fs'
import { join, relative } from 'path'
import { logger } from '../../logger'
import { TrackerConfig } from '../tracker'
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
 * Determine what action should be taken for a file during sync
 * @param sourcePath Source file path
 * @param localPath Local file path
 * @param repo Repository name
 * @param relativeFilePath Relative file path for tracking
 * @param trackerConfig Tracker configuration
 * @returns Object containing the action to take and all relevant file hashes
 */
export function actionOnFile(
  sourcePath: string,
  localPath: string,
  repo: string,
  relativeFilePath: string,
  trackerConfig: TrackerConfig,
): FileActionResult {
  // If local file doesn't exist, we need to copy it
  if (!existsSync(localPath)) {
    return {
      action: FileAction.COPY,
      sourceFileHash: getFileHash(sourcePath),
      localFileHash: '',
      trackerFileHash: null
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
      trackerFileHash
    }
  }

  // If localFileHash === trackerFileHash && localFileHash !== sourceFileHash
  // Then copy the file, it means only sourceFile changes, but localFile didn't change.
  if (localFileHash === trackerFileHash && localFileHash !== sourceFileHash) {
    return {
      action: FileAction.COPY,
      sourceFileHash,
      localFileHash,
      trackerFileHash
    }
  }

  // If localFileHash !== trackerFileHash && trackerFileHash === sourceFileHash
  // It means file changed only in local, we needn't do anything
  if (localFileHash !== trackerFileHash && trackerFileHash === sourceFileHash) {
    return {
      action: FileAction.NONE,
      sourceFileHash,
      localFileHash,
      trackerFileHash
    }
  }

  // If localFileHash !== trackerFileHash && localFileHash !== sourceFileHash
  // It means file changes in local, file changes in source - we need to merge
  if (localFileHash !== trackerFileHash && localFileHash !== sourceFileHash) {
    return {
      action: FileAction.MERGE,
      sourceFileHash,
      localFileHash,
      trackerFileHash
    }
  }

  // Default case: no changes detected
  return {
    action: FileAction.NONE,
    sourceFileHash,
    localFileHash,
    trackerFileHash
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
  repo?: string,
): void {
  // Create local directory if needed
  if (!existsSync(localDir)) {
    mkdirSync(localDir, { recursive: true })
  }

  try {
    // Process each entry in the directory
    readdirSync(sourceDir, { withFileTypes: true }).forEach((entry) => {
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
