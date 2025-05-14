import { execSync } from 'child_process'
import { tmpdir } from 'os'
import { join } from 'path'
import { randomUUID } from 'crypto'
import { mkdirSync } from 'fs'
import { logger } from '../../logger'
import { escapeShellArg } from '../gh-sync-utils/file-utils'
import { PullRequestInfo } from '../tracker'

/**
 * Checks if GitHub CLI is installed and authenticated
 * @returns An object with isInstalled and isAuthenticated flags
 */
export function checkGitHubCli(): { isInstalled: boolean; isAuthenticated: boolean } {
  try {
    // Check if gh is installed
    execSync('which gh', { stdio: 'ignore' })

    try {
      // Check if gh is authenticated
      execSync('gh auth status', { stdio: 'ignore' })
      return { isInstalled: true, isAuthenticated: true }
    } catch (e) {
      // gh is installed but not authenticated
      return { isInstalled: true, isAuthenticated: false }
    }
  } catch (e) {
    // gh is not installed
    return { isInstalled: false, isAuthenticated: false }
  }
}

/**
 * Clones a forked repository to a temporary directory
 */
export function cloneForkRepo(forkRepo: string): { tempDir: string; cleanup: () => void } {
  const tempDir = join(tmpdir(), `contribute-${randomUUID()}`)
  mkdirSync(tempDir, { recursive: true })

  logger.info(`Cloning fork repository ${forkRepo} to temporary directory`)
  const cloneCommand = `git clone https://github.com/${forkRepo}.git ${escapeShellArg(tempDir)}`
  execSync(cloneCommand, { stdio: 'inherit', cwd: process.cwd() })

  return {
    tempDir,
    cleanup: () => {
      try {
        execSync(`rm -rf ${escapeShellArg(tempDir)}`, { stdio: 'inherit' })
      } catch (e) {
        logger.warn(`Failed to clean up temporary directory: ${(e as Error).message}`)
      }
    },
  }
}

/**
 * Creates a new branch in the forked repository
 */
export function createBranch(tempDir: string, branchName: string): boolean {
  try {
    logger.info(`Creating branch ${branchName} in forked repository`)
    execSync(`git checkout -b ${escapeShellArg(branchName)}`, {
      stdio: 'inherit',
      cwd: tempDir,
    })
    return true
  } catch (e) {
    logger.error(`Failed to create branch: ${(e as Error).message}`)
    return false
  }
}

/**
 * Commits changes to the forked repository
 * @returns An object with success status and whether changes were actually committed
 */
export function commitChanges(tempDir: string, commitMessage: string): { success: boolean; changesCommitted: boolean } {
  try {
    logger.info('Committing changes to forked repository')
    execSync('git add .', { stdio: 'inherit', cwd: tempDir })

    // Check if there are changes to commit
    const statusOutput = execSync('git status --porcelain', { stdio: 'pipe', cwd: tempDir }).toString().trim()

    if (!statusOutput) {
      logger.info('No changes to commit, working tree clean')
      return { success: true, changesCommitted: false } // No changes to commit
    }

    execSync(`git commit -m ${escapeShellArg(commitMessage)}`, {
      stdio: 'inherit',
      cwd: tempDir,
    })
    return { success: true, changesCommitted: true } // Changes committed successfully
  } catch (e) {
    logger.error(`Failed to commit changes: ${(e as Error).message}`)
    return { success: false, changesCommitted: false }
  }
}

/**
 * Pushes changes to the forked repository
 */
export function pushBranch(tempDir: string, branchName: string): boolean {
  try {
    logger.info(`Pushing branch ${branchName} to forked repository`)
    execSync(`git push -u origin ${escapeShellArg(branchName)}`, {
      stdio: 'inherit',
      cwd: tempDir,
    })
    return true
  } catch (e) {
    logger.error(`Failed to push branch: ${(e as Error).message}`)
    return false
  }
}

/**
 * Gets the status of a pull request
 * @returns PR info or null if PR doesn't exist or can't be fetched
 */
export function getPullRequestStatus(sourceRepo: string, prNumber: number): PullRequestInfo | null {
  try {
    // Use GitHub CLI to get PR status
    const prCommand = `gh pr view ${prNumber} --repo ${escapeShellArg(sourceRepo)} --json number,headRefName,state,updatedAt`
    
    const prOutput = execSync(prCommand, {
      stdio: 'pipe',
    }).toString().trim()
    
    const prData = JSON.parse(prOutput)
    
    return {
      prNumber: prData.number,
      branchName: prData.headRefName,
      status: prData.state === 'OPEN' ? 'open' : (prData.state === 'MERGED' ? 'merged' : 'closed'),
      lastUpdated: prData.updatedAt
    }
  } catch (e) {
    // PR doesn't exist or can't be fetched
    return null
  }
}

/**
 * Checks out an existing branch in the forked repository
 */
export function checkoutExistingBranch(tempDir: string, branchName: string): boolean {
  try {
    logger.info(`Checking out existing branch ${branchName} in forked repository`)
    execSync(`git checkout ${escapeShellArg(branchName)}`, {
      stdio: 'inherit',
      cwd: tempDir,
    })
    return true
  } catch (e) {
    logger.error(`Failed to checkout branch: ${(e as Error).message}`)
    return false
  }
}

/**
 * Force pushes changes to the forked repository
 * This is used when we need to update an existing PR
 */
export function forcePushBranch(tempDir: string, branchName: string): boolean {
  try {
    logger.info(`Force pushing branch ${branchName} to forked repository`)
    execSync(`git push -f -u origin ${escapeShellArg(branchName)}`, {
      stdio: 'inherit',
      cwd: tempDir,
    })
    return true
  } catch (e) {
    logger.error(`Failed to force push branch: ${(e as Error).message}`)
    return false
  }
}

/**
 * Creates a pull request from the forked repository to the original repository
 */
export function createPullRequest(
  tempDir: string,
  sourceRepo: string,
  forkRepo: string,
  branchName: string,
  prTitle: string,
  prBody: string,
  dryRun: boolean = false,
): { success: boolean; prNumber?: number; prUrl?: string } {
  try {
    // If in dry run mode, just log what would happen and return success
    if (dryRun) {
      logger.info(`[DRY RUN] Would create pull request from ${forkRepo}:${branchName} to ${sourceRepo}:main`)
      logger.info(`[DRY RUN] PR Title: ${prTitle}`)
      logger.info(`[DRY RUN] PR Body: ${prBody}`)
      return {
        success: true,
        prNumber: 0,
        prUrl: 'https://github.com/dry-run/pr-url',
      }
    }

    logger.info(`Creating pull request from ${forkRepo}:${branchName} to ${sourceRepo}:main`)

    // Create PR using GitHub CLI
    const prCommand = `gh pr create --repo ${escapeShellArg(sourceRepo)} --head ${
      forkRepo.split('/')[0]
    }:${escapeShellArg(branchName)} --title ${escapeShellArg(prTitle)} --body ${escapeShellArg(prBody)}`

    const prOutput = execSync(prCommand, {
      stdio: 'pipe',
      cwd: tempDir,
    })
      .toString()
      .trim()

    // Extract PR number and URL from the output
    const prUrl = prOutput
    const prNumber = prUrl.split('/').pop()

    logger.info(`Pull request created: ${prUrl}`)

    return {
      success: true,
      prNumber: Number(prNumber),
      prUrl,
    }
  } catch (e) {
    logger.error(`Failed to create pull request: ${(e as Error).message}`)
    return { success: false }
  }
}
