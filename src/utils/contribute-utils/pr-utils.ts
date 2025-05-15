import { execSync } from 'child_process'
import { logger } from '../../logger'
import { escapeShellArg } from '../gh-sync-utils/file-utils'
import { PullRequestInfo } from '../tracker'

/**
 * Gets the status of a pull request
 * @returns PR info or null if PR doesn't exist or can't be fetched
 */
export function getPullRequestStatus(sourceRepo: string, prNumber: number): PullRequestInfo | null {
  try {
    // Use GitHub CLI to get PR status
    const prStatusCommand = `gh pr view ${prNumber} --repo ${escapeShellArg(sourceRepo)} --json state,url,number`
    const prStatus = JSON.parse(execSync(prStatusCommand, { encoding: 'utf8' }))

    return {
      prNumber: prStatus.number,
      status: prStatus.state,
      branchName: '', // We don't get this from the API, but it's not needed here
      lastUpdated: new Date().toISOString(),
    }
  } catch (e) {
    logger.warn(`Failed to get PR status: ${(e as Error).message}`)
    return null
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
  dryRun: boolean = false
): { success: boolean; prNumber?: number; prUrl?: string } {
  try {
    // If in dry run mode, just log what would happen and return success
    if (dryRun) {
      logger.info(
        `[DRY RUN] Would create pull request from ${forkRepo}:${branchName} to ${sourceRepo}:main`
      )
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
    // If forkRepo is the same as sourceRepo, we don't need to specify the owner in the head parameter
    const headParam =
      forkRepo === sourceRepo
        ? escapeShellArg(branchName)
        : `${forkRepo.split('/')[0]}:${escapeShellArg(branchName)}`

    const prCommand = `gh pr create --repo ${escapeShellArg(sourceRepo)} --head ${headParam} --title ${escapeShellArg(prTitle)} --body ${escapeShellArg(prBody)}`

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
