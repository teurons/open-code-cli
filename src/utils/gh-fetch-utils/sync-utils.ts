import { copyFileSync } from 'fs'
import { logger } from '../../logger'
import { TrackerConfig } from '../tracker'
import { FileAction, FileSyncOperation, FileSyncResult, SyncSummary } from './types'
import { actionOnFile, getFileHash } from './file-utils'

/**
 * Executes a batch of file sync operations
 * @param operations Array of file sync operations
 * @param trackerConfig Tracker configuration for file hash tracking
 * @returns Object containing updated file data and detailed results of each operation
 */
export function executeSyncOperations(
  operations: FileSyncOperation[],
  trackerConfig: TrackerConfig,
): {
  updatedFiles: Record<string, Record<string, { hash: string; syncedAt: string }>>
  results: FileSyncResult[]
} {
  const results: FileSyncResult[] = []
  const updatedFiles: Record<string, Record<string, { hash: string; syncedAt: string }>> = {}

  // Process each operation
  for (const operation of operations) {
    const { sourcePath, localPath, repo, relativeLocalPath } = operation

    // Initialize repo entry in updatedFiles if it doesn't exist
    if (!updatedFiles[repo]) {
      updatedFiles[repo] = {}
    }

    try {
      // Determine what action to take
      const actionResult = actionOnFile(
        sourcePath,
        localPath,
        repo,
        relativeLocalPath,
        trackerConfig
      )

      // Execute the action
      const syncResult = {
        success: true,
        message: '',
        fileHash: '',
        syncedAt: new Date().toISOString(),
      }

      switch (actionResult.action) {
        case FileAction.COPY:
          try {
            // Copy the file from source to local
            copyFileSync(sourcePath, localPath)
            syncResult.fileHash = getFileHash(localPath)
            syncResult.message = 'File copied successfully'
            
            // Update file data for tracking
            updatedFiles[repo][relativeLocalPath] = {
              hash: syncResult.fileHash,
              syncedAt: syncResult.syncedAt,
            }
          } catch (e) {
            syncResult.success = false
            syncResult.message = `Failed to copy file: ${(e as Error).message}`
          }
          break

        case FileAction.NONE:
          // No action needed
          syncResult.fileHash = actionResult.localFileHash
          syncResult.message = 'No action needed (unchanged or local changes only)'
          break

        case FileAction.MERGE:
          // Need to merge changes
          syncResult.success = false
          syncResult.message = 'Manual merge required (both source and local have changed)'
          break

        default:
          syncResult.success = false
          syncResult.message = `Unknown action: ${actionResult.action}`
      }

      // Add the result to the results array
      results.push({
        operation,
        actionResult,
        syncResult,
        success: syncResult.success,
        message: syncResult.message,
        fileHash: syncResult.fileHash,
        syncedAt: syncResult.syncedAt,
      })
    } catch (e) {
      // Handle any errors during processing
      results.push({
        operation,
        actionResult: {
          action: FileAction.NONE,
          sourceFileHash: '',
          localFileHash: '',
          trackerFileHash: null,
        },
        syncResult: {
          success: false,
          message: `Error processing file: ${(e as Error).message}`,
        },
        success: false,
        message: `Error processing file: ${(e as Error).message}`,
      })
    }
  }

  return { updatedFiles, results }
}

/**
 * Generate a summary of sync operations
 * @param results Array of sync results
 * @returns Summary object with counts and details
 */
export function generateSyncSummary(results: FileSyncResult[]): SyncSummary {
  const summary: SyncSummary = {
    totalFiles: results.length,
    successCount: 0,
    failCount: 0,
    copyCount: 0,
    noneCount: 0,
    mergeCount: 0,
    failedFiles: [],
  }

  for (const result of results) {
    if (result.success) {
      summary.successCount++
    } else {
      summary.failCount++
      summary.failedFiles.push(result)
    }

    // Count by action type
    switch (result.actionResult.action) {
      case FileAction.COPY:
        summary.copyCount++
        break
      case FileAction.NONE:
        summary.noneCount++
        break
      case FileAction.MERGE:
        summary.mergeCount++
        break
    }
  }

  return summary
}

/**
 * Log a summary of sync operations
 * @param summary Summary object
 * @param isRepoLevel Whether this is a repository-level summary (true) or overall summary (false)
 * @param repoName Optional repository name for repo-level summaries
 */
export function logSyncSummary(summary: SyncSummary, isRepoLevel: boolean = false, repoName?: string): void {
  const scope = isRepoLevel && repoName ? `Repository ${repoName}` : 'Overall';
  
  logger.info(`${scope} sync summary: ${summary.successCount} files synced successfully, ${summary.failCount} files with issues`)
  logger.info(`${scope} action breakdown: ${summary.copyCount} copied, ${summary.noneCount} unchanged, ${summary.mergeCount} need merge`)
  
  if (summary.failCount > 0) {
    logger.warn(`${isRepoLevel ? 'Files' : 'Files across all repositories'} with issues:`)
    summary.failedFiles.forEach(r => {
      const path = isRepoLevel ? r.operation.relativeLocalPath : `${r.operation.repo}/${r.operation.relativeLocalPath}`
      logger.warn(`- ${path}: ${r.actionResult.action} - ${r.syncResult.message}`)
    })
  }
}
