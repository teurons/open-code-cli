import { logger } from "../../logger";
import { ContributeSyncResult } from "./types";

/**
 * Generates a summary of sync operations
 */
export function generateContributeSyncSummary(
  results: ContributeSyncResult[]
): {
  copyCount: number;
  deleteCount: number;
  skipCount: number;
  failCount: number;
  totalCount: number;
} {
  return {
    copyCount: results.filter(r => r.success && r.action === "copy").length,
    deleteCount: results.filter(r => r.success && r.action === "delete").length,
    skipCount: results.filter(r => r.success && r.action === "skip").length,
    failCount: results.filter(r => !r.success).length,
    totalCount: results.length,
  };
}

/**
 * Logs a summary of sync operations
 */
export function logContributeSyncSummary(
  summary: {
    copyCount: number;
    deleteCount: number;
    skipCount: number;
    failCount: number;
    totalCount: number;
  },
  isRepoLevel: boolean,
  repoName?: string
): void {
  const { copyCount, deleteCount, skipCount, failCount, totalCount } = summary;

  const prefix = isRepoLevel && repoName ? `[${repoName}] ` : "";

  if (totalCount === 0) {
    logger.info(`${prefix}No files to contribute`);
    return;
  }

  logger.info("----------------------------------------");
  logger.info(`${prefix}CONTRIBUTE SUMMARY:`);
  logger.info(`${prefix}Files copied:   ${copyCount}`);
  logger.info(`${prefix}Files deleted:  ${deleteCount}`);
  logger.info(`${prefix}Files skipped:  ${skipCount}`);
  logger.info(`${prefix}Failed operations: ${failCount}`);
  logger.info(`${prefix}Total operations: ${totalCount}`);
  logger.info("----------------------------------------");
}
