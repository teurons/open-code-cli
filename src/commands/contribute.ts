import { ArgumentsCamelCase, Argv } from 'yargs'
import * as process from 'node:process'
import { existsSync } from 'fs'
import { join } from 'path'
import { logger } from '../logger'
import { bold, green, red } from 'picocolors'
import { readTrackerConfig } from '../utils/tracker'
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
  createPullRequest,
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

    // Hardcode PR title and commit message
    const branchName = `contribute-${new Date().toISOString().split('T')[0]}`
    const commitMessage = 'feat: contribute changes from local to source'
    const prTitle = 'Contribute changes from local to source'
    const prBody = 'This PR contains changes contributed from local to source.'

    // Process each repository
    for (const { repo, forkRepo, filePaths } of reposWithFork) {
      logger.info(`Contributing to repository ${repo} using fork ${forkRepo}`)

      // 1. Clone the forked repo
      const { tempDir, cleanup } = cloneForkRepo(forkRepo)

      try {
        // 2. Create a branch
        const branchSuccess = createBranch(tempDir, branchName)
        if (!branchSuccess) {
          logger.error(`Failed to create branch for ${repo}`)
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

        // If dry run, skip the rest
        if (argv.dryRun) {
          logger.info(`Dry run completed for ${repo}`)
          continue
        }

        // 5. Commit changes
        const commitSuccess = commitChanges(tempDir, commitMessage)
        if (!commitSuccess) {
          logger.error(`Failed to commit changes for ${repo}`)
          continue
        }

        // 6. Push branch
        const pushSuccess = pushBranch(tempDir, branchName)
        if (!pushSuccess) {
          logger.error(`Failed to push branch for ${repo}`)
          continue
        }

        // 7. Create PR
        const prResult = createPullRequest(tempDir, repo, forkRepo, branchName, prTitle, prBody, Boolean(argv.dryRun))

        if (prResult.success && prResult.prUrl) {
          logger.info(`Successfully created PR for ${repo}: ${prResult.prUrl}`)
        } else {
          logger.error(`Failed to create PR for ${repo}`)
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
