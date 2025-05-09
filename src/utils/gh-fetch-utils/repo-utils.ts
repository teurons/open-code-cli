import { execSync } from 'child_process'
import { tmpdir } from 'os'
import { join } from 'path'
import { randomUUID } from 'crypto'
import { mkdirSync } from 'fs'
import { logger } from '../../logger'
import { escapeShellArg } from './file-utils'

/**
 * Gets the latest commit hash for a GitHub repository and branch
 * @param repo The repository name in the format 'owner/repo'
 * @param branch The branch name
 * @returns The latest commit hash
 */
export function getLatestCommitHash(repo: string, branch: string): string {
  return execSync(`git ls-remote https://github.com/${repo}.git ${branch} | cut -f1`).toString().trim()
}

/**
 * Downloads a GitHub repository to a temporary directory
 * @param repo The repository name in the format 'owner/repo'
 * @param branch The branch name
 * @returns The path to the temporary directory and a cleanup function
 */
export function downloadRepository(repo: string, branch: string): { tempDir: string; cleanup: () => void } {
  const tempDir = join(tmpdir(), `gh-fetch-${randomUUID()}`)
  mkdirSync(tempDir, { recursive: true })

  // Download the entire repository once
  logger.info(`Downloading repository ${repo} to temporary directory`)
  const gigetCommand = `npx giget gh:${repo}#${branch} ${escapeShellArg(tempDir)} --force`
  execSync(gigetCommand, { stdio: 'inherit', cwd: process.cwd() })

  // Return the temp directory and a cleanup function
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
