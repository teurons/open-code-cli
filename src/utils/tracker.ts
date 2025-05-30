import fs from "fs";
import path from "path";
import { logger } from "../logger";
import type { FetchFile } from "./gh-sync-utils/gh-sync-repo";

// Tracker file name
const TRACKER_FILENAME = "open-code-cli.tracker.json";

/**
 * Interface for file sync tracking data
 */
export interface FileSyncData {
  hash: string;
  syncedAt: string;
  action?: string;
  relativeSourcePath?: string;
}

/**
 * Interface for pull request information
 */
export interface PullRequestInfo {
  prNumber: number;
  branchName: string;
  status: "open" | "closed" | "merged";
  lastUpdated: string;
}

/**
 * Interface for repository sync tracking data
 */
export interface RepoSyncData {
  branch: string;
  lastCommitHash: string;
  syncedAt: string;
  forkRepo?: string;
  filePaths: FetchFile[];
  files: Record<string, FileSyncData>;
  pullRequest?: PullRequestInfo;
}

/**
 * Interface for the tracker file structure
 */
export interface TrackerConfig {
  repos: Record<string, RepoSyncData>;
}

/**
 * Checks if a tracker file exists in the specified directory
 */
export function trackerExists(directory: string): boolean {
  const trackerPath = path.join(directory, TRACKER_FILENAME);
  return fs.existsSync(trackerPath);
}

/**
 * Reads the tracker configuration from the specified directory
 */
export function readTrackerConfig(directory: string): TrackerConfig {
  const trackerPath = path.join(directory, TRACKER_FILENAME);

  if (!fs.existsSync(trackerPath)) {
    return { repos: {} };
  }

  try {
    const trackerData = fs.readFileSync(trackerPath, "utf-8");
    return JSON.parse(trackerData) as TrackerConfig;
  } catch (error) {
    logger.warn(
      `Failed to read tracker configuration: ${(error as Error).message}`
    );
    return { repos: {} };
  }
}

/**
 * Writes the tracker configuration to the specified directory
 */
export function writeTrackerConfig(
  directory: string,
  config: TrackerConfig
): void {
  const trackerPath = path.join(directory, TRACKER_FILENAME);

  try {
    fs.writeFileSync(trackerPath, JSON.stringify(config, null, 2));
  } catch (error) {
    logger.error(
      `Failed to write tracker configuration: ${(error as Error).message}`
    );
    throw error;
  }
}

/**
 * Gets the last synced commit hash for a repository
 * Returns null if the repository hasn't been synced before
 */
export function getLastSyncedCommit(
  directory: string,
  repo: string,
  branch: string
): string | null {
  const config = readTrackerConfig(directory);

  const repoData = config.repos[repo];
  if (!repoData || repoData.branch !== branch) {
    return null;
  }

  return repoData.lastCommitHash;
}

/**
 * Checks if a repository needs to be synced by comparing the latest commit hash
 * with the last synced commit hash
 */
export function needsSync(
  directory: string,
  repo: string,
  branch: string,
  latestCommitHash: string
): boolean {
  const lastSyncedCommit = getLastSyncedCommit(directory, repo, branch);

  // If never synced before or commit hash is different, sync is needed
  return !lastSyncedCommit || lastSyncedCommit !== latestCommitHash;
}

// updateFileHash function removed as it's no longer needed - file hashes are now updated in batch

/**
 * Gets the last synced hash for a file
 * @param directory The directory containing the tracker file
 * @param repo The repository name
 * @param filePath The relative path of the file
 * @param trackerConfig Optional tracker config to use instead of reading from disk
 * @returns The last synced hash or null if not found
 */
export function getLastSyncedFileHash(
  directory: string,
  repo: string,
  filePath: string,
  trackerConfig?: TrackerConfig
): string | null {
  // Use provided tracker config or read from disk
  const config = trackerConfig || readTrackerConfig(directory);

  if (
    !config.repos[repo] ||
    !config.repos[repo].files ||
    !config.repos[repo].files[filePath]
  ) {
    return null;
  }

  return config.repos[repo].files[filePath].hash;
}
