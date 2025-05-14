import { ArgumentsCamelCase, Argv } from 'yargs'
import * as process from 'node:process'
import { existsSync } from 'fs'
import { join } from 'path'
import { logger } from '../logger'
import { bold, green, red } from 'picocolors'
import { readTrackerConfig, writeTrackerConfig } from '../utils/tracker'
import {
  collectContributeSyncOperations,
  executeContributeSyncOperations,
  generateContributeSyncSummary,
  logContributeSyncSummary,
} from '../utils/contribute-utils/file-utils'
import {
  checkGitHubCli,
  cloneForkRepo,
  createBranch,
  commitChanges,
  pushBranch,
  forcePushBranch,
  createPullRequest,
  getPullRequestStatus,
  checkoutExistingBranch,
  syncForkWithSource,
  mergeMainIntoCurrentBranch,
} from '../utils/contribute-utils/repo-utils'

interface ContributeArgv {
  dryRun?: boolean
}

export const command = 'contribute'
export const describe = 'Contribute changes from local to source repositories'
export const aliases = ['c']

export function builder(yargs: Argv<ContributeArgv>): Argv {
  return yargs.option('dry-run', {
    alias: 'd',
    type: 'boolean',
    description: 'Perform a dry run without making any changes',
    default: false,
  })
}

export async function handler(argv: ArgumentsCamelCase<ContributeArgv>) {
  try {
    // Check if GitHub CLI is installed and authenticated
    const { isInstalled, isAuthenticated } = checkGitHubCli()

    if (!isInstalled) {
      logger.error(red('GitHub CLI (gh) is not installed. Please install it to use the contribute command.'))
      logger.info('You can install it from: https://cli.github.com/manual/installation')
      process.exit(1)
    }

    if (!isAuthenticated) {
      logger.error(red('GitHub CLI (gh) is not authenticated. Please authenticate it to use the contribute command.'))
      logger.info('You can authenticate by running: gh auth login')
      process.exit(1)
    }

    const cwd = process.cwd()
    const trackerPath = join(cwd, 'open-code-cli.tracker.json')

    // Check if tracker file exists
    if (!existsSync(trackerPath)) {
      logger.error(red('Tracker file not found. Please run gh-sync first to create a tracker file.'))
      process.exit(1)
    }

    // Read tracker configuration
    const trackerConfig = readTrackerConfig(cwd)

    // Find repos with forkRepo
    const reposWithFork = Object.entries(trackerConfig.repos)
      .filter(([_, repoData]) => repoData.forkRepo)
      .map(([repo, repoData]) => ({ repo, forkRepo: repoData.forkRepo!, filePaths: repoData.filePaths }))

    if (reposWithFork.length === 0) {
      logger.error(red('No repositories with fork found in tracker'))
      process.exit(1)
    }

    logger.info(`Found ${reposWithFork.length} repositories with fork`)

    // PR details
    const defaultBranchName = `contribute-${new Date().toISOString().split('T')[0]}`
    const commitMessage = 'feat: contribute changes from local to source'
    const prTitle = 'Contribute changes from local to source'
    let prBody = 'This PR contains changes contributed from local to source, including:'

    // Process each repository
    for (const { repo, forkRepo, filePaths } of reposWithFork) {
      logger.info(`Contributing to repository ${repo} using fork ${forkRepo}`)

      // Read current tracker config to check for existing PRs
      const trackerConfig = readTrackerConfig(cwd)
      const repoData = trackerConfig.repos[repo]

      let branchName = defaultBranchName
      let updateExistingPR = false

      // Check if we have an existing PR for this repo
      if (repoData?.pullRequest) {
        const prInfo = repoData.pullRequest
        logger.info(`Found existing PR #${prInfo.prNumber} for ${repo} using branch ${prInfo.branchName}`)

        // Check if the PR is still open
        const currentPRStatus = getPullRequestStatus(repo, prInfo.prNumber)

        if (currentPRStatus && currentPRStatus.status === 'open') {
          // PR is still open, we can update it
          logger.info(`PR #${prInfo.prNumber} is still open, will update it`)
          branchName = prInfo.branchName
          updateExistingPR = true
        } else {
          // PR is closed or merged, create a new one
          logger.info(`PR #${prInfo.prNumber} is ${currentPRStatus?.status || 'not found'}, will create a new PR`)
        }
      }

      // 1. Clone the forked repo
      const { tempDir, cleanup } = cloneForkRepo(forkRepo)

      try {
        // 1.1 Sync fork with source repository to ensure it's up-to-date
        const syncSuccess = syncForkWithSource(tempDir, repo)
        if (!syncSuccess) {
          logger.warn(`Failed to sync fork with source for ${repo}, continuing with potentially outdated code`)
        } else {
          logger.info(`Successfully synced fork ${forkRepo} with source ${repo}`)
        }
        // 2. Create or checkout branch
        let branchSuccess = false

        if (updateExistingPR) {
          // Try to checkout existing branch
          branchSuccess = checkoutExistingBranch(tempDir, branchName)
          if (!branchSuccess) {
            // If checkout fails, fall back to creating a new branch
            logger.warn(`Failed to checkout existing branch ${branchName}, will create a new one`)
            branchName = defaultBranchName
            updateExistingPR = false
            branchSuccess = createBranch(tempDir, branchName)
          } else {
            // Branch checkout successful, merge main branch into it to keep it updated
            logger.info(`Merging main branch into ${branchName} to keep it updated`)
            const mergeSuccess = mergeMainIntoCurrentBranch(tempDir)
            if (!mergeSuccess) {
              logger.warn(`Failed to merge main branch into ${branchName}, continuing with potentially outdated code`)
            } else {
              logger.info(`Successfully merged main branch into ${branchName}`)
            }
          }
        } else {
          // Create a new branch
          branchSuccess = createBranch(tempDir, branchName)
        }

        if (!branchSuccess) {
          logger.error(`Failed to create/checkout branch for ${repo}`)
          continue
        }

        // 3. Collect sync operations
        const syncOperations = collectContributeSyncOperations(filePaths, tempDir, cwd, repo)

        if (syncOperations.length === 0) {
          logger.info(`No files to contribute for ${repo}`)
          continue
        }

        // 4. Execute sync operations
        const syncResults = await executeContributeSyncOperations(syncOperations, Boolean(argv.dryRun))

        // Generate and log sync summary
        const syncSummary = generateContributeSyncSummary(syncResults)
        logContributeSyncSummary(syncSummary, true, repo)
        
        // Update PR body with sync summary
        prBody += `\n\n### ${repo}\n- ${syncSummary.copyCount} files copied\n- ${syncSummary.deleteCount} files deleted\n- ${syncSummary.skipCount} files skipped`

        // If dry run, skip the rest
        if (argv.dryRun) {
          logger.info(`Dry run completed for ${repo}`)
          continue
        }

        // 5. Commit changes
        const commitResult = commitChanges(tempDir, commitMessage)
        if (!commitResult.success) {
          logger.error(`Failed to commit changes for ${repo}`)
          continue
        }

        // If no changes were committed, skip push and PR creation
        if (!commitResult.changesCommitted) {
          logger.info(`No changes to push for ${repo}, skipping PR creation`)
          continue
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
          continue
        }

        // 7. Create PR if needed
        if (!updateExistingPR) {
          const prResult = createPullRequest(tempDir, repo, forkRepo, branchName, prTitle, prBody, Boolean(argv.dryRun))

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
          const prNumber = repoData?.pullRequest?.prNumber || 0
          logger.info(`Successfully updated PR #${prNumber} for ${repo}`)

          // Update last updated timestamp
          if (trackerConfig.repos[repo] && trackerConfig.repos[repo].pullRequest) {
            trackerConfig.repos[repo].pullRequest!.lastUpdated = new Date().toISOString()
            writeTrackerConfig(cwd, trackerConfig)
          }
        }
      } finally {
        // Clean up
        cleanup()
      }
    }

    logger.box(green(bold('Contribute command completed')))
  } catch (error) {
    logger.error(red(`Contribute failed: ${(error as Error).message}`))
    process.exit(1)
  }
}
