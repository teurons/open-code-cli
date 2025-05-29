import { execSync } from "child_process";
import { tmpdir } from "os";
import { join } from "path";
import { randomUUID } from "crypto";
import { mkdirSync } from "fs";
import { logger } from "../../logger";
import { escapeShellArg } from "../gh-sync-utils/file-utils";

/**
 * Checks if GitHub CLI is installed and authenticated
 * @returns An object with isInstalled and isAuthenticated flags
 */
export function checkGitHubCli(): {
  isInstalled: boolean;
  isAuthenticated: boolean;
} {
  try {
    // Check if gh is installed
    execSync("which gh", { stdio: "ignore" });

    try {
      // Check if gh is authenticated
      execSync("gh auth status", { stdio: "ignore" });
      return { isInstalled: true, isAuthenticated: true };
    } catch (e) {
      // gh is installed but not authenticated
      return { isInstalled: true, isAuthenticated: false };
    }
  } catch (e) {
    // gh is not installed
    return { isInstalled: false, isAuthenticated: false };
  }
}

/**
 * Clones a forked repository to a temporary directory
 */
export function cloneForkRepo(forkRepo: string): {
  tempDir: string;
  cleanup: () => void;
} {
  const tempDir = join(tmpdir(), `contribute-${randomUUID()}`);
  mkdirSync(tempDir, { recursive: true });

  logger.info(`Cloning fork repository ${forkRepo} to temporary directory`);
  const cloneCommand = `git clone https://github.com/${forkRepo}.git ${escapeShellArg(tempDir)}`;
  execSync(cloneCommand, {
    stdio: ["ignore", "ignore", "ignore"],
    cwd: process.cwd(),
  });

  return {
    tempDir,
    cleanup: () => {
      try {
        execSync(`rm -rf ${escapeShellArg(tempDir)}`, { stdio: "inherit" });
      } catch (e) {
        logger.warn(
          `Failed to clean up temporary directory: ${(e as Error).message}`
        );
      }
    },
  };
}
