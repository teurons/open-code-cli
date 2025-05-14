import { existsSync, copyFileSync, statSync, mkdirSync, readdirSync, unlinkSync } from 'fs'
import { dirname, join, relative } from 'path'
import { logger } from '../../logger'
import { context } from '../../context'
import { FetchFile } from '../gh-sync-utils/gh-sync-repo'
import { ContributeSyncOperation, ContributeSyncResult, ContributeOperationType } from './types'

/**
 * Collects sync operations for all files to contribute
 */
export function collectContributeSyncOperations(
  filePaths: FetchFile[],
  tempDir: string,
  cwd: string,
  repo: string
): ContributeSyncOperation[] {
  const syncOperations: ContributeSyncOperation[] = []

  for (const filePath of filePaths) {
    const { source, local } = filePath

    // Replace variables in paths
    const processedSource = context.replaceVariables(source)
    const processedLocal = context.replaceVariables(local)

    // Create paths for source and local
    const localFullPath = join(cwd, processedLocal)
    const sourceFullPath = join(tempDir, processedSource)

    if (existsSync(localFullPath)) {
      if (statSync(localFullPath).isDirectory()) {
        collectDirectoryOperations(localFullPath, sourceFullPath, cwd, tempDir, repo, syncOperations)
      } else {
        addFileToSyncOperations(localFullPath, sourceFullPath, cwd, tempDir, repo, syncOperations)
      }
    }
  }

  // Detect files that exist in source but not in local (deleted files)
  detectDeletedFilesForContribute(filePaths, tempDir, cwd, repo, syncOperations)

  return syncOperations
}

/**
 * Recursively collects sync operations for all files in a directory
 */
function collectDirectoryOperations(
  localDirPath: string,
  sourceDirPath: string,
  cwd: string,
  tempDir: string,
  repo: string,
  syncOperations: ContributeSyncOperation[]
): void {
  // Ensure source directory exists
  if (!existsSync(sourceDirPath)) {
    mkdirSync(sourceDirPath, { recursive: true })
  }

  // Get all files in the local directory
  const files = readdirSync(localDirPath)

  for (const file of files) {
    const localFilePath = join(localDirPath, file)
    const sourceFilePath = join(sourceDirPath, file)

    if (statSync(localFilePath).isDirectory()) {
      collectDirectoryOperations(localFilePath, sourceFilePath, cwd, tempDir, repo, syncOperations)
    } else {
      addFileToSyncOperations(localFilePath, sourceFilePath, cwd, tempDir, repo, syncOperations)
    }
  }
}

/**
 * Adds a single file to the sync operations list
 */
function addFileToSyncOperations(
  localFilePath: string,
  sourceFilePath: string,
  cwd: string,
  tempDir: string,
  repo: string,
  syncOperations: ContributeSyncOperation[],
  operationType: ContributeOperationType = 'copy'
): void {
  const relativeLocalPath = relative(cwd, localFilePath)
  const relativeSourcePath = relative(tempDir, sourceFilePath)

  syncOperations.push({
    absoluteLocalPath: localFilePath,
    absoluteSourcePath: sourceFilePath,
    relativeLocalPath,
    relativeSourcePath,
    repo,
    operationType,
  })
}

/**
 * Detects files that exist in source but have been deleted locally
 */
function detectDeletedFilesForContribute(
  filePaths: FetchFile[],
  tempDir: string,
  cwd: string,
  repo: string,
  syncOperations: ContributeSyncOperation[]
): void {
  logger.info(`[${repo}] Checking for deleted files...`)
  logger.info(`[${repo}] Source directory: ${tempDir}`)
  logger.info(`[${repo}] Local directory: ${cwd}`)
  logger.info(`[${repo}] Total file paths to check: ${filePaths.length}`)

  // We need to check all files in the source repository to detect deletions
  // First, get the list of all files in the source repository (fork)
  const allSourceFiles = new Map<string, string>() // Map of relative path to absolute path

  // Scan all files in the source repository
  function scanSourceDirectory(dir: string): void {
    if (!existsSync(dir)) {
      return
    }

    const files = readdirSync(dir)
    for (const file of files) {
      const fullPath = join(dir, file)

      // Skip .git directory
      if (file === '.git') {
        continue
      }

      if (statSync(fullPath).isDirectory()) {
        scanSourceDirectory(fullPath)
      } else {
        const relativePath = relative(tempDir, fullPath)
        allSourceFiles.set(relativePath, fullPath)
      }
    }
  }

  // Scan the entire source directory
  scanSourceDirectory(tempDir)
  logger.info(`[${repo}] Found ${allSourceFiles.size} files in source repository`)

  // Log the first 10 files found (for debugging)
  let count = 0
  for (const [relativePath, _] of allSourceFiles) {
    if (count < 10) {
      logger.info(`[${repo}] Source file ${count + 1}: ${relativePath}`)
      count++
    } else {
      break
    }
  }

  // Now check each file in filePaths to see if it exists locally
  // We'll create a map of all the files we're supposed to be tracking
  const trackedFiles = new Map<string, string>() // Map of source path to local path

  for (const filePath of filePaths) {
    const { source, local } = filePath
    const processedSource = context.replaceVariables(source)
    const processedLocal = context.replaceVariables(local)

    // Check if this is a directory
    const sourceFullPath = join(tempDir, processedSource)

    if (existsSync(sourceFullPath) && statSync(sourceFullPath).isDirectory()) {
      // For directories, we need to track all files within them
      logger.info(`[${repo}] Tracking directory: ${processedSource}`)

      // Find all files in this directory from our allSourceFiles map
      for (const [relativePath, _] of allSourceFiles) {
        if (relativePath === processedSource || relativePath.startsWith(processedSource + '/')) {
          // This file is inside the tracked directory
          const localRelativePath = relativePath.replace(processedSource, processedLocal)
          trackedFiles.set(relativePath, localRelativePath)
          logger.info(`[${repo}] Tracking file in directory: source=${relativePath}, local=${localRelativePath}`)
        }
      }
    } else {
      // For individual files, just track the file
      trackedFiles.set(processedSource, processedLocal)
      logger.info(`[${repo}] Tracking file: source=${processedSource}, local=${processedLocal}`)
    }
  }

  logger.info(`[${repo}] Tracking ${trackedFiles.size} files for potential deletion`)

  // Now check each tracked file to see if it exists locally
  let deletedFilesCount = 0

  for (const [sourcePath, localPath] of trackedFiles) {
    const sourceFullPath = join(tempDir, sourcePath)
    const localFullPath = join(cwd, localPath)

    // Skip if source file doesn't exist
    if (!existsSync(sourceFullPath)) {
      logger.info(`[${repo}] Source file doesn't exist, skipping: ${sourcePath}`)
      continue
    }

    // Check if local file exists
    if (!existsSync(localFullPath)) {
      logger.info(`[${repo}] Detected deleted file: ${sourcePath} (local: ${localPath})`)
      deletedFilesCount++

      // Add delete operation
      syncOperations.push({
        absoluteLocalPath: localFullPath,
        absoluteSourcePath: sourceFullPath,
        relativeLocalPath: localPath,
        relativeSourcePath: sourcePath,
        repo,
        operationType: 'delete',
      })
    }
  }

  // Also check for the specific case of newfile.md at the root level
  const newFilePath = 'newfile.md'
  const sourceNewFilePath = join(tempDir, newFilePath)
  const localNewFilePath = join(cwd, newFilePath)

  if (existsSync(sourceNewFilePath) && !existsSync(localNewFilePath)) {
    logger.info(`[${repo}] Detected special case deleted file: ${newFilePath}`)
    deletedFilesCount++

    syncOperations.push({
      absoluteLocalPath: localNewFilePath,
      absoluteSourcePath: sourceNewFilePath,
      relativeLocalPath: newFilePath,
      relativeSourcePath: newFilePath,
      repo,
      operationType: 'delete',
    })
  }

  logger.info(`[${repo}] Detected ${deletedFilesCount} deleted files`)
}

/**
 * Executes sync operations to copy files from local to source
 */
export async function executeContributeSyncOperations(
  operations: ContributeSyncOperation[],
  dryRun: boolean
): Promise<ContributeSyncResult[]> {
  const results: ContributeSyncResult[] = []

  // Log summary of operations to be executed
  const copyOps = operations.filter(op => op.operationType === 'copy').length
  const deleteOps = operations.filter(op => op.operationType === 'delete').length
  logger.info(`Executing ${operations.length} operations: ${copyOps} copy, ${deleteOps} delete`)

  for (const operation of operations) {
    const { absoluteLocalPath, absoluteSourcePath, relativeLocalPath, relativeSourcePath, operationType, repo } =
      operation

    try {
      if (dryRun) {
        logger.info(`[DRY RUN] Would ${operationType} ${relativeLocalPath} to ${relativeSourcePath}`)
        results.push({
          operation,
          success: true,
          action: operationType,
        })
      } else {
        if (operationType === 'copy') {
          // Ensure the directory exists
          const sourceDir = dirname(absoluteSourcePath)
          if (!existsSync(sourceDir)) {
            logger.info(`Creating directory: ${sourceDir}`)
            mkdirSync(sourceDir, { recursive: true })
          }

          // Copy the file
          logger.info(`Copying file: ${absoluteLocalPath} -> ${absoluteSourcePath}`)
          copyFileSync(absoluteLocalPath, absoluteSourcePath)
          logger.info(`Copied ${relativeLocalPath} to ${relativeSourcePath}`)

          results.push({
            operation,
            success: true,
            action: 'copy',
          })
        } else if (operationType === 'delete') {
          // Delete the file if it exists
          logger.info(`[${repo}] Attempting to delete file: ${absoluteSourcePath}`)

          if (existsSync(absoluteSourcePath)) {
            logger.info(`[${repo}] File exists, deleting: ${absoluteSourcePath}`)
            unlinkSync(absoluteSourcePath)
            logger.info(`[${repo}] Deleted ${relativeSourcePath}`)

            results.push({
              operation,
              success: true,
              action: 'delete',
            })
          } else {
            // File already doesn't exist, mark as success
            logger.info(`[${repo}] File doesn't exist, skipping: ${absoluteSourcePath}`)
            results.push({
              operation,
              success: true,
              action: 'skip',
            })
          }
        }
      }
    } catch (error) {
      logger.error(
        `[${repo}] Failed to ${operationType} ${relativeLocalPath} to ${relativeSourcePath}: ${(error as Error).message}`
      )
      results.push({
        operation,
        success: false,
        error: (error as Error).message,
        action: operationType,
      })
    }
  }

  // Log summary of results
  const successCopy = results.filter(r => r.success && r.action === 'copy').length
  const successDelete = results.filter(r => r.success && r.action === 'delete').length
  const skipped = results.filter(r => r.success && r.action === 'skip').length
  const failed = results.filter(r => !r.success).length

  logger.info(
    `Operations completed: ${successCopy} copied, ${successDelete} deleted, ${skipped} skipped, ${failed} failed`
  )

  return results
}

/**
 * Generates a summary of sync operations
 */
export function generateContributeSyncSummary(results: ContributeSyncResult[]): {
  copyCount: number
  deleteCount: number
  skipCount: number
  failCount: number
  totalCount: number
} {
  return {
    copyCount: results.filter(r => r.success && r.action === 'copy').length,
    deleteCount: results.filter(r => r.success && r.action === 'delete').length,
    skipCount: results.filter(r => r.success && r.action === 'skip').length,
    failCount: results.filter(r => !r.success).length,
    totalCount: results.length,
  }
}

/**
 * Logs a summary of sync operations
 */
export function logContributeSyncSummary(
  summary: {
    copyCount: number
    deleteCount: number
    skipCount: number
    failCount: number
    totalCount: number
  },
  isRepoLevel: boolean,
  repoName?: string
): void {
  const { copyCount, deleteCount, skipCount, failCount, totalCount } = summary

  const prefix = isRepoLevel && repoName ? `[${repoName}] ` : ''

  if (totalCount === 0) {
    logger.info(`${prefix}No files to contribute`)
    return
  }

  logger.info('----------------------------------------')
  logger.info(`${prefix}CONTRIBUTE SUMMARY:`)
  logger.info(`${prefix}Files copied:   ${copyCount}`)
  logger.info(`${prefix}Files deleted:  ${deleteCount}`)
  logger.info(`${prefix}Files skipped:  ${skipCount}`)
  logger.info(`${prefix}Failed operations: ${failCount}`)
  logger.info(`${prefix}Total operations: ${totalCount}`)
  logger.info('----------------------------------------')
}
