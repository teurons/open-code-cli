import { logger } from '../../logger'
import { writeTrackerConfig } from '../tracker'
import {
  collectContributeSyncOperations,
  executeContributeSyncOperations,
  generateContributeSyncSummary,
  logContributeSyncSummary,
} from './file-utils'
import {
  commitChanges,
  pushBranch,
  forcePushBranch,
  createPullRequest,
} from './repo-utils'
import { TrackerConfig } from '../tracker'
import { FetchFile } from '../gh-sync-utils/gh-sync-repo'

interface ProcessRepositoryOptions {
  repo: string
  forkRepo: string
  filePaths: FetchFile[]
  tempDir: string
  cwd: string
  branchName: string
  updateExistingPR: boolean
  prTitle: string
  prBody: string
  commitMessage: string
  dryRun: boolean
  trackerConfig: TrackerConfig
}

/**
 * Process a repository and create or update a PR
 */
export async function processRepositoryAndCreatePR(options: ProcessRepositoryOptions): Promise<void> {
  const {
    repo,
    forkRepo,
    filePaths,
    tempDir,
    cwd,
    branchName,
    updateExistingPR,
    prTitle,
    prBody,
    commitMessage,
    dryRun,
    trackerConfig,
  } = options

  // 3. Collect sync operations
  const syncOperations = collectContributeSyncOperations(filePaths, tempDir, cwd, repo)

  if (syncOperations.length === 0) {
    logger.info(`No files to contribute for ${repo}`)
    return
  }

  // 4. Execute sync operations
  const syncResults = await executeContributeSyncOperations(syncOperations, dryRun)

  // Generate and log sync summary
  const syncSummary = generateContributeSyncSummary(syncResults)
  logContributeSyncSummary(syncSummary, true, repo)

  // Update PR body with sync summary
  const updatedPrBody = `${prBody}\n\n### ${repo}\n- ${syncSummary.copyCount} files copied\n- ${syncSummary.deleteCount} files deleted\n- ${syncSummary.skipCount} files skipped`

  // If dry run, skip the rest
  if (dryRun) {
    logger.info(`Dry run completed for ${repo}`)
    return
  }

  // 5. Commit changes
  const commitResult = commitChanges(tempDir, commitMessage)
  if (!commitResult.success) {
    logger.error(`Failed to commit changes for ${repo}`)
    return
  }

  // If no changes were committed, skip push and PR creation
  if (!commitResult.changesCommitted) {
    logger.info(`No changes to push for ${repo}, skipping PR creation`)
    return
  }

  // 6. Push branch (force push if updating existing PR)
  let pushSuccess = false
  if (updateExistingPR) {
    pushSuccess = forcePushBranch(tempDir, branchName)
  } else {
    pushSuccess = pushBranch(tempDir, branchName)
  }

  if (!pushSuccess) {
    logger.error(`Failed to push branch for ${repo}`)
    return
  }

  // 7. Create PR if needed
  if (!updateExistingPR) {
    const prResult = createPullRequest(tempDir, repo, forkRepo, branchName, prTitle, updatedPrBody, dryRun)

    if (prResult.success && prResult.prUrl) {
      logger.info(`Successfully created PR for ${repo}: ${prResult.prUrl}`)

      // Update tracker with PR info
      if (!trackerConfig.repos[repo]) {
        trackerConfig.repos[repo] = {
          branch: 'main', // Default branch
          lastCommitHash: '',
          syncedAt: new Date().toISOString(),
          forkRepo,
          filePaths,
          files: {},
        }
      }

      trackerConfig.repos[repo].pullRequest = {
        prNumber: prResult.prNumber!,
        branchName,
        status: 'open',
        lastUpdated: new Date().toISOString(),
      }

      writeTrackerConfig(cwd, trackerConfig)
    } else {
      logger.error(`Failed to create PR for ${repo}`)
    }
  } else {
    // We know repoData and pullRequest exist here because updateExistingPR is true
    const prNumber = trackerConfig.repos[repo]?.pullRequest?.prNumber || 0
    logger.info(`Successfully updated PR #${prNumber} for ${repo}`)

    // Update last updated timestamp
    if (trackerConfig.repos[repo] && trackerConfig.repos[repo].pullRequest) {
      trackerConfig.repos[repo].pullRequest!.lastUpdated = new Date().toISOString()
      writeTrackerConfig(cwd, trackerConfig)
    }
  }
}
