import { existsSync, copyFileSync, statSync, mkdirSync, readdirSync, unlinkSync } from 'fs'
import { dirname, join, relative } from 'path'
import { logger } from '../../logger'
import { ContributeSyncOperation, ContributeSyncResult, ContributeOperationType } from './types'

/**
 * Adds a single file to the sync operations list
 */
export function addFileToSyncOperations(
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
 * Recursively collects sync operations for all files in a directory
 */
export function collectDirectoryOperations(
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
 * Executes sync operations to copy files from local to source
 */
export async function executeContributeSyncOperations(
  operations: ContributeSyncOperation[],
  dryRun: boolean
): Promise<ContributeSyncResult[]> {
  const results: ContributeSyncResult[] = []

  for (const operation of operations) {
    const { absoluteLocalPath, absoluteSourcePath, relativeLocalPath, relativeSourcePath, repo, operationType } =
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
