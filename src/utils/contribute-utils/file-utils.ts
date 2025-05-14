import { existsSync, copyFileSync, statSync, mkdirSync } from 'fs'
import { dirname, join, relative } from 'path'
import { logger } from '../../logger'
import { context } from '../../context'
import { FetchFile } from '../gh-sync-utils/gh-sync-repo'
import { ContributeSyncOperation, ContributeSyncResult } from './types'

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

    if (statSync(localFullPath).isDirectory()) {
      collectDirectoryOperations(
        localFullPath,
        sourceFullPath,
        cwd,
        tempDir,
        repo,
        syncOperations
      )
    } else {
      addFileToSyncOperations(
        localFullPath,
        sourceFullPath,
        cwd,
        tempDir,
        repo,
        syncOperations
      )
    }
  }

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
  const files = require('fs').readdirSync(localDirPath)

  for (const file of files) {
    const localFilePath = join(localDirPath, file)
    const sourceFilePath = join(sourceDirPath, file)
    
    if (statSync(localFilePath).isDirectory()) {
      collectDirectoryOperations(
        localFilePath,
        sourceFilePath,
        cwd,
        tempDir,
        repo,
        syncOperations
      )
    } else {
      addFileToSyncOperations(
        localFilePath,
        sourceFilePath,
        cwd,
        tempDir,
        repo,
        syncOperations
      )
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
  syncOperations: ContributeSyncOperation[]
): void {
  const relativeLocalPath = relative(cwd, localFilePath)
  const relativeSourcePath = relative(tempDir, sourceFilePath)

  syncOperations.push({
    absoluteLocalPath: localFilePath,
    absoluteSourcePath: sourceFilePath,
    relativeLocalPath,
    relativeSourcePath,
    repo,
  })
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
    const { absoluteLocalPath, absoluteSourcePath, relativeLocalPath, relativeSourcePath } = operation
    
    try {
      if (dryRun) {
        logger.info(`[DRY RUN] Would copy ${relativeLocalPath} to ${relativeSourcePath}`)
        results.push({
          operation,
          success: true,
          action: 'copy',
        })
      } else {
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
          action: 'copy',
        })
      }
    } catch (error) {
      logger.error(`Failed to copy ${relativeLocalPath} to ${relativeSourcePath}: ${(error as Error).message}`)
      results.push({
        operation,
        success: false,
        error: (error as Error).message,
        action: 'copy',
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
  skipCount: number
  failCount: number
  totalCount: number
} {
  return {
    copyCount: results.filter(r => r.success && r.action === 'copy').length,
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
    skipCount: number
    failCount: number
    totalCount: number
  },
  isRepoLevel: boolean,
  repoName?: string
): void {
  const { copyCount, skipCount, failCount, totalCount } = summary
  
  const prefix = isRepoLevel && repoName ? `[${repoName}] ` : ''
  
  if (totalCount === 0) {
    logger.info(`${prefix}No files to contribute`)
    return
  }
  
  logger.info(
    `${prefix}Contribute summary: ${copyCount} copied, ${skipCount} skipped, ${failCount} failed, ${totalCount} total`
  )
}
