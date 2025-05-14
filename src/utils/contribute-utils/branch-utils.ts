import { execSync } from 'child_process'
import { logger } from '../../logger'
import { escapeShellArg } from '../gh-sync-utils/file-utils'

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
 * Merges the main branch into the current feature branch
 * @param tempDir Directory where the repository is cloned
 * @returns True if merge was successful
 */
export function mergeMainIntoCurrentBranch(tempDir: string): boolean {
  try {
    logger.info('Merging main branch into current branch')

    // Fetch the latest changes
    execSync('git fetch origin', {
      stdio: 'inherit',
      cwd: tempDir,
    })

    // Merge origin/main into the current branch
    execSync('git merge origin/main', {
      stdio: 'inherit',
      cwd: tempDir,
    })

    logger.info('Successfully merged main branch into current branch')
    return true
  } catch (e) {
    logger.error(`Failed to merge main branch: ${(e as Error).message}`)
    return false
  }
}
