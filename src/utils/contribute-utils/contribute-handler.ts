import * as process from 'node:process'
import { existsSync } from 'fs'
import { join } from 'path'
import { logger } from '../../logger'
import { bold, green, red } from 'picocolors'
import { readTrackerConfig } from '../../utils/tracker'
import {
  checkGitHubCli,
  cloneForkRepo,
  createBranch,
  getPullRequestStatus,
  checkoutExistingBranch,
  syncForkWithSource,
  mergeMainIntoCurrentBranch,
} from './repo-utils'
import { processRepositoryAndCreatePR } from './process-repo'

export interface ContributeOptions {
  dryRun?: boolean
}

/**
 * Main handler for the contribute command
 */
export async function handleContributeCommand(options: ContributeOptions): Promise<void> {
  try {
    // Check if GitHub CLI is installed and authenticated
    const { isInstalled, isAuthenticated } = checkGitHubCli()

    if (!isInstalled) {
      logger.error(
        red('GitHub CLI (gh) is not installed. Please install it to use the contribute command.')
      )
      logger.info('You can install it from: https://cli.github.com/manual/installation')
      process.exit(1)
    }

    if (!isAuthenticated) {
      logger.error(
        red(
          'GitHub CLI (gh) is not authenticated. Please authenticate it to use the contribute command.'
        )
      )
      logger.info('You can authenticate by running: gh auth login')
      process.exit(1)
    }

    const cwd = process.cwd()
    const trackerPath = join(cwd, 'open-code-cli.tracker.json')

    // Check if tracker file exists
    if (!existsSync(trackerPath)) {
      logger.error(
        red('Tracker file not found. Please run gh-sync first to create a tracker file.')
      )
      process.exit(1)
    }

    // Read tracker configuration
    const trackerConfig = readTrackerConfig(cwd)

    // Find repos with forkRepo
    const reposWithFork = Object.entries(trackerConfig.repos)
      .filter(([_, repoData]) => repoData.forkRepo)
      .map(([repo, repoData]) => ({
        repo,
        forkRepo: repoData.forkRepo!,
        filePaths: repoData.filePaths,
      }))

    if (reposWithFork.length === 0) {
      logger.error(red('No repositories with fork found in tracker'))
      process.exit(1)
    }

    logger.info(`Found ${reposWithFork.length} repositories with fork`)

    // PR details
    const defaultBranchName = `contribute-${new Date().toISOString().split('T')[0]}`
    const commitMessage = 'feat: contribute changes from local to source'
    const prTitle = 'Contribute changes from local to source'
    const prBody = 'This PR contains changes contributed from local to source, including:'

    // Process each repository
    for (const { repo, forkRepo, filePaths } of reposWithFork) {
      logger.info(`Contributing to repository ${repo} using fork ${forkRepo}`)
      
      // Check if fork repo is the same as source repo
      const isSelfFork = forkRepo === repo
      if (isSelfFork) {
        logger.info(`Fork repository is the same as source repository (${repo})`)
      }

      // Read current tracker config to check for existing PRs
      const trackerConfig = readTrackerConfig(cwd)
      const repoData = trackerConfig.repos[repo]

      let branchName = defaultBranchName
      let updateExistingPR = false

      // Check if we have an existing PR for this repo
      if (repoData?.pullRequest) {
        const prInfo = repoData.pullRequest
        logger.info(
          `Found existing PR #${prInfo.prNumber} for ${repo} using branch ${prInfo.branchName}`
        )

        // Check if the PR is still open
        const currentPRStatus = getPullRequestStatus(repo, prInfo.prNumber)

        if (currentPRStatus && currentPRStatus.status === 'open') {
          // PR is still open, we can update it
          logger.info(`PR #${prInfo.prNumber} is still open, will update it`)
          branchName = prInfo.branchName
          updateExistingPR = true
        } else {
          // PR is closed or merged, create a new one
          logger.info(`PR #${prInfo.prNumber} is closed or merged, will create a new PR`)
        }
      }

      // Clone the fork repository
      const { tempDir, cleanup } = cloneForkRepo(forkRepo)

      try {
        // Sync fork with source if needed
        if (updateExistingPR && forkRepo !== repo) {
          logger.info(`Syncing fork ${forkRepo} with source ${repo}`)
          const syncSuccess = syncForkWithSource(tempDir, repo)
          if (!syncSuccess) {
            logger.error(`Failed to sync fork with source for ${repo}`)
            continue
          }
        } else if (updateExistingPR && forkRepo === repo) {
          logger.info(`Fork repository is the same as source repository (${repo}), skipping sync`)
        }

        // Create or checkout branch
        let branchSuccess = false
        if (updateExistingPR) {
          // Checkout existing branch
          branchSuccess = checkoutExistingBranch(tempDir, branchName)

          if (branchSuccess) {
            // Try to merge main into the branch to keep it up to date
            logger.info(`Merging main branch into ${branchName}`)
            const mergeSuccess = mergeMainIntoCurrentBranch(tempDir)
            if (!mergeSuccess) {
              logger.warn(`Failed to merge main branch into ${branchName}, continuing anyway`)
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

        // Process repository and create PR
        await processRepositoryAndCreatePR({
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
          dryRun: Boolean(options.dryRun),
          trackerConfig,
        })
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
