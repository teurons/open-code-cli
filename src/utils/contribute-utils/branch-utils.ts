import { execSync } from "child_process";
import { logger } from "../../logger";
import { escapeShellArg } from "../gh-sync-utils/file-utils";

/**
 * Creates a new branch in the forked repository
 * Handles the case where the branch might already exist remotely
 */
export function createBranch(tempDir: string, branchName: string): boolean {
  try {
    // Check if branch exists remotely
    let remoteBranchExists = false;
    try {
      const branches = execSync("git branch -r", {
        cwd: tempDir,
        encoding: "utf8",
      }).toString();
      remoteBranchExists = branches.includes(`origin/${branchName}`);
    } catch (e) {
      // Ignore error checking remote branches
    }

    if (remoteBranchExists) {
      logger.info(`Branch ${branchName} exists remotely, checking it out`);
      return checkoutExistingBranch(tempDir, branchName);
    }

    logger.info(`Creating branch ${branchName} in forked repository`);
    execSync(`git checkout -b ${escapeShellArg(branchName)}`, {
      stdio: "inherit",
      cwd: tempDir,
    });
    return true;
  } catch (e) {
    logger.error(`Failed to create branch: ${(e as Error).message}`);
    return false;
  }
}

/**
 * Checks out an existing branch in the forked repository
 * Handles the case where the branch exists remotely but not locally
 */
export function checkoutExistingBranch(
  tempDir: string,
  branchName: string
): boolean {
  try {
    logger.info(
      `Checking out existing branch ${branchName} in forked repository`
    );

    try {
      // Try to checkout local branch first
      execSync(`git checkout ${escapeShellArg(branchName)}`, {
        stdio: "inherit",
        cwd: tempDir,
      });
      return true;
    } catch (localCheckoutError) {
      // If local checkout fails, try to checkout from remote
      logger.info(`Local branch not found, trying to checkout from remote`);

      try {
        // Fetch the branch from remote
        execSync(`git fetch origin ${escapeShellArg(branchName)}`, {
          stdio: "inherit",
          cwd: tempDir,
        });

        // Create a tracking branch
        execSync(
          `git checkout -b ${escapeShellArg(branchName)} --track origin/${escapeShellArg(branchName)}`,
          {
            stdio: "inherit",
            cwd: tempDir,
          }
        );
        return true;
      } catch (remoteCheckoutError) {
        // If remote checkout also fails, the branch might not exist
        logger.error(
          `Failed to checkout branch from remote: ${(remoteCheckoutError as Error).message}`
        );
        return false;
      }
    }
  } catch (e) {
    logger.error(`Failed to checkout branch: ${(e as Error).message}`);
    return false;
  }
}

/**
 * Pushes changes to the forked repository
 * Handles the case where the remote branch is ahead of the local branch
 */
export function pushBranch(tempDir: string, branchName: string): boolean {
  try {
    logger.info(`Pushing branch ${branchName} to forked repository`);
    try {
      // First try a normal push
      execSync(`git push -u origin ${escapeShellArg(branchName)}`, {
        stdio: "inherit",
        cwd: tempDir,
      });
      return true;
    } catch (pushError) {
      // If push fails, it might be because the remote branch is ahead
      logger.warn(
        `Push failed, remote branch exists and is different. Using force push to avoid conflicts.`
      );

      // Instead of trying to merge (which can cause conflicts),
      // we'll use force push since this is a contribution workflow
      // where we want our local changes to take precedence
      return forcePushBranch(tempDir, branchName);
    }
  } catch (e) {
    logger.error(`Failed to push branch: ${(e as Error).message}`);
    return false;
  }
}

/**
 * Force pushes changes to the forked repository
 * This is used when we need to update an existing PR
 */
export function forcePushBranch(tempDir: string, branchName: string): boolean {
  try {
    logger.info(`Force pushing branch ${branchName} to forked repository`);
    execSync(`git push -f -u origin ${escapeShellArg(branchName)}`, {
      stdio: "inherit",
      cwd: tempDir,
    });
    return true;
  } catch (e) {
    logger.error(`Failed to force push branch: ${(e as Error).message}`);
    return false;
  }
}

/**
 * Merges the main branch into the current feature branch
 * @param tempDir Directory where the repository is cloned
 * @returns True if merge was successful
 */
export function mergeMainIntoCurrentBranch(tempDir: string): boolean {
  try {
    logger.info("Merging main branch into current branch");

    // Fetch the latest changes
    execSync("git fetch origin", {
      stdio: "inherit",
      cwd: tempDir,
    });

    // Merge origin/main into the current branch
    execSync("git merge origin/main", {
      stdio: "inherit",
      cwd: tempDir,
    });

    logger.info("Successfully merged main branch into current branch");
    return true;
  } catch (e) {
    logger.error(`Failed to merge main branch: ${(e as Error).message}`);
    return false;
  }
}
