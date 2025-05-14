import { existsSync, statSync } from 'fs'
import { join } from 'path'
import { context } from '../../context'
import { FetchFile } from '../gh-sync-utils/gh-sync-repo'
import { ContributeSyncOperation } from './types'

// Import from utility files
import { collectDirectoryOperations, addFileToSyncOperations } from './file-operations'
import { detectDeletedFilesForContribute } from './file-detection'
import { executeContributeSyncOperations } from './file-operations'
import { generateContributeSyncSummary, logContributeSyncSummary } from './summary-utils'

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
        collectDirectoryOperations(
          localFullPath,
          sourceFullPath,
          cwd,
          tempDir,
          repo,
          syncOperations
        )
      } else {
        addFileToSyncOperations(localFullPath, sourceFullPath, cwd, tempDir, repo, syncOperations)
      }
    }
  }

  // Detect files that exist in source but not in local (deleted files)
  detectDeletedFilesForContribute(filePaths, tempDir, cwd, repo, syncOperations)

  return syncOperations
}

// Re-export functions from other utility files
export { executeContributeSyncOperations, generateContributeSyncSummary, logContributeSyncSummary }
