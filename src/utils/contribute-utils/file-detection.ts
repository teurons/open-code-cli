import { existsSync, readdirSync, statSync } from 'fs'
import { join, relative } from 'path'
import { logger } from '../../logger'
import { FetchFile } from '../gh-sync-utils/gh-sync-repo'
import { ContributeSyncOperation } from './types'
import { addFileToSyncOperations } from './file-operations'

/**
 * Detects files that exist in source but have been deleted locally
 */
export function detectDeletedFilesForContribute(
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

  // Scan the source repository
  scanSourceDirectory(tempDir)
  logger.info(`[${repo}] Found ${allSourceFiles.size} files in source repository`)

  // Now, for each file path in the tracker, check if the local file exists
  // If it doesn't exist, add a delete operation
  for (const filePath of filePaths) {
    const { source, local } = filePath

    // Skip if source is not specified
    if (!source) {
      continue
    }

    // Create the full source path
    const sourceFullPath = join(tempDir, source)

    // If the source is a directory, we need to check all files in it
    if (existsSync(sourceFullPath) && statSync(sourceFullPath).isDirectory()) {
      // Get all files in the source directory
      const sourceFiles = new Map<string, string>()

      function scanSourceDir(dir: string, basePath: string): void {
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
            scanSourceDir(fullPath, join(basePath, file))
          } else {
            const relativePath = join(basePath, file)
            sourceFiles.set(relativePath, fullPath)
          }
        }
      }

      scanSourceDir(sourceFullPath, '')

      // For each file in the source directory, check if it exists in the local directory
      for (const [relativePath, fullSourcePath] of sourceFiles.entries()) {
        const localFullPath = join(cwd, local, relativePath)

        if (!existsSync(localFullPath)) {
          // File exists in source but not in local, add a delete operation
          logger.info(`[${repo}] File deleted locally: ${relativePath}`)
          addFileToSyncOperations(
            localFullPath,
            fullSourcePath,
            cwd,
            tempDir,
            repo,
            syncOperations,
            'delete'
          )
        }
      }
    } else if (existsSync(sourceFullPath) && statSync(sourceFullPath).isFile()) {
      // It's a file, check if the local file exists
      const localFullPath = join(cwd, local)

      if (!existsSync(localFullPath)) {
        // File exists in source but not in local, add a delete operation
        logger.info(`[${repo}] File deleted locally: ${source}`)
        addFileToSyncOperations(
          localFullPath,
          sourceFullPath,
          cwd,
          tempDir,
          repo,
          syncOperations,
          'delete'
        )
      }
    }
  }

  logger.info(`[${repo}] Detected ${syncOperations.filter(op => op.operationType === 'delete').length} deleted files`)
}
