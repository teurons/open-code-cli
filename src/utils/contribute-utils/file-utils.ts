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
    operationType
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
  // Create a set of all local paths from the filePaths
  const localPaths = new Set<string>()
  for (const filePath of filePaths) {
    const { local } = filePath
    const processedLocal = context.replaceVariables(local)
    localPaths.add(processedLocal)
  }

  // Check each source file to see if it exists locally
  for (const filePath of filePaths) {
    const { source } = filePath
    const processedSource = context.replaceVariables(source)
    const sourceFullPath = join(tempDir, processedSource)

    // Skip if the source file doesn't exist
    if (!existsSync(sourceFullPath) || statSync(sourceFullPath).isDirectory()) {
      continue
    }

    // Get the relative path from the source
    const relativeSourcePath = relative(tempDir, sourceFullPath)
    
    // Check if this file exists in the local paths
    const localExists = Array.from(localPaths).some(localPath => {
      const relativeLocalPath = localPath
      return relativeLocalPath === relativeSourcePath
    })

    // If the file doesn't exist locally but does in source, add it as a delete operation
    if (!localExists) {
      const localFullPath = join(cwd, relativeSourcePath)
      
      syncOperations.push({
        absoluteLocalPath: localFullPath,
        absoluteSourcePath: sourceFullPath,
        relativeLocalPath: relativeSourcePath,
        relativeSourcePath,
        repo,
        operationType: 'delete'
      })
    }
  }
}

/**
 * Executes sync operations to copy files from local to source
 */
export async function executeContributeSyncOperations(
  operations: ContributeSyncOperation[],
  dryRun: boolean
): Promise<ContributeSyncResult[]> {
  const results: ContributeSyncResult[] = []

  for (const operation of operations) {
    const { absoluteLocalPath, absoluteSourcePath, relativeLocalPath, relativeSourcePath, operationType } = operation

    try {
      if (dryRun) {
        logger.info(`[DRY RUN] Would ${operationType} ${relativeLocalPath} to ${relativeSourcePath}`)
        results.push({
          operation,
          success: true,
          action: operationType
        })
      } else {
        if (operationType === 'copy') {
          // Ensure the directory exists
          const sourceDir = dirname(absoluteSourcePath)
          if (!existsSync(sourceDir)) {
            mkdirSync(sourceDir, { recursive: true })
          }

          // Copy the file
          copyFileSync(absoluteLocalPath, absoluteSourcePath)
          logger.info(`Copied ${relativeLocalPath} to ${relativeSourcePath}`)

          results.push({
            operation,
            success: true,
            action: 'copy'
          })
        } else if (operationType === 'delete') {
          // Delete the file if it exists
          if (existsSync(absoluteSourcePath)) {
            unlinkSync(absoluteSourcePath)
            logger.info(`Deleted ${relativeSourcePath}`)

            results.push({
              operation,
              success: true,
              action: 'delete'
            })
          } else {
            // File already doesn't exist, mark as success
            results.push({
              operation,
              success: true,
              action: 'skip'
            })
          }
        }
      }
    } catch (error) {
      logger.error(`Failed to ${operationType} ${relativeLocalPath} to ${relativeSourcePath}: ${(error as Error).message}`)
      results.push({
        operation,
        success: false,
        error: (error as Error).message,
        action: operationType
      })
    }
  }

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

  logger.info(
    `${prefix}Contribute summary: ${copyCount} copied, ${deleteCount} deleted, ${skipCount} skipped, ${failCount} failed, ${totalCount} total`
  )
}
