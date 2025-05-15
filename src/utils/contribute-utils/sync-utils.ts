import { execSync } from "child_process";
import { logger } from "../../logger";
import { escapeShellArg } from "../gh-sync-utils/file-utils";

/**
 * Syncs a fork with its source repository
 * @param tempDir Directory where the fork is cloned
 * @param sourceRepo Source repository (owner/repo)
 * @returns True if sync was successful
 */
export function syncForkWithSource(
  tempDir: string,
  sourceRepo: string
): boolean {
  try {
    logger.info(`Syncing fork with source repository ${sourceRepo}`);

    // Add the original repository as a remote
    execSync(
      `git remote add source https://github.com/${escapeShellArg(sourceRepo)}.git`,
      {
        stdio: "inherit",
        cwd: tempDir,
      }
    );

    // Fetch from the source repository
    execSync("git fetch source", {
      stdio: "inherit",
      cwd: tempDir,
    });

    // Make sure we're on the main branch
    execSync("git checkout main", {
      stdio: "inherit",
      cwd: tempDir,
    });

    // Merge changes from source/main into the fork's main branch
    execSync("git merge source/main", {
      stdio: "inherit",
      cwd: tempDir,
    });

    // Push the updated main branch to the fork
    execSync("git push origin main", {
      stdio: "inherit",
      cwd: tempDir,
    });

    logger.info("Successfully synced fork with source repository");
    return true;
  } catch (e) {
    logger.error(`Failed to sync fork with source: ${(e as Error).message}`);
    return false;
  }
}

/**
 * Commits changes to the forked repository
 * @returns An object with success status and whether changes were actually committed
 */
export function commitChanges(
  tempDir: string,
  commitMessage: string
): { success: boolean; changesCommitted: boolean } {
  try {
    logger.info("Committing changes to forked repository");

    // Check if there are any changes to commit
    const statusResult = execSync("git status --porcelain", {
      cwd: tempDir,
      encoding: "utf8",
    });

    if (!statusResult.trim()) {
      // No changes to commit
      logger.info("No changes to commit, working tree clean");
      return { success: true, changesCommitted: false };
    }

    // Add all changes including deletions
    execSync("git add --all", { stdio: "inherit", cwd: tempDir });

    // Commit changes
    execSync(`git commit -m ${escapeShellArg(commitMessage)}`, {
      stdio: "inherit",
      cwd: tempDir,
    });

    return { success: true, changesCommitted: true };
  } catch (error) {
    logger.error(`Failed to commit changes: ${(error as Error).message}`);
    return { success: false, changesCommitted: false };
  }
}
