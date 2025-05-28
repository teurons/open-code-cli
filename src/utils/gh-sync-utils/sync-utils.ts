import { copyFileSync, writeFileSync, readFileSync, unlinkSync } from "fs";
import { logger } from "../../logger";
import { TrackerConfig } from "../tracker";
import {
  FileAction,
  FileSyncOperation,
  FileSyncResult,
  SyncSummary,
} from "./types";
import { actionOnFile, getFileHash } from "./file-utils";
import { aiMerge } from "../ai-utils";
import { getOpenRouterApiKey, getOpenRouterModel } from "../config";

/**
 * Executes a batch of file sync operations
 * @param operations Array of file sync operations
 * @param trackerConfig Tracker configuration for file hash tracking
 * @returns Object containing updated file data and detailed results of each operation
 */
export async function executeSyncOperations(
  operations: FileSyncOperation[],
  trackerConfig: TrackerConfig,
  sourceCommitHash?: string,
  force: boolean = false
): Promise<{
  updatedFiles: Record<
    string,
    Record<
      string,
      {
        hash: string;
        syncedAt: string;
        action: string;
        relativeSourcePath: string;
      }
    >
  >;
  results: FileSyncResult[];
}> {
  const results: FileSyncResult[] = [];
  const updatedFiles: Record<
    string,
    Record<
      string,
      {
        hash: string;
        syncedAt: string;
        action: string;
        relativeSourcePath: string;
      }
    >
  > = {};

  // Process each operation
  for (const operation of operations) {
    const { sourcePath, localPath, repo, relativeLocalPath } = operation;

    // Initialize repo entry in updatedFiles if it doesn't exist
    if (!updatedFiles[repo]) {
      updatedFiles[repo] = {};
    }

    try {
      // Determine what action to take
      const actionResult = actionOnFile(
        sourcePath,
        localPath,
        repo,
        relativeLocalPath,
        trackerConfig,
        sourceCommitHash,
        force
      );

      // Logging is now handled by logSyncDetails after all operations are complete

      // Execute the action
      const syncResult = {
        success: true,
        message: "",
        fileHash: "",
        syncedAt: new Date().toISOString(),
      };

      switch (actionResult.action) {
        case FileAction.COPY:
          try {
            // Copy the file from source to local
            copyFileSync(sourcePath, localPath);
            syncResult.fileHash = getFileHash(localPath);
            syncResult.message = "File copied successfully";

            // Update file data for tracking
            updatedFiles[repo][relativeLocalPath] = {
              hash: syncResult.fileHash,
              syncedAt: syncResult.syncedAt,
              action: FileAction.COPY,
              relativeSourcePath: operation.relativeSourcePath,
            };
          } catch (e) {
            syncResult.success = false;
            syncResult.message = `Failed to copy file: ${(e as Error).message}`;
          }
          break;

        case FileAction.NONE:
          // No action needed
          syncResult.fileHash = actionResult.localFileHash;
          syncResult.message =
            "No action needed (unchanged or local changes only)";
          break;

        case FileAction.UPDATE_TRACKER:
          // Only update the tracker hash, no file changes needed
          syncResult.fileHash = actionResult.localFileHash;
          syncResult.message =
            "Updated tracker hash only (local changes synced with source)";

          // Update file data for tracking
          updatedFiles[repo][relativeLocalPath] = {
            hash: syncResult.fileHash,
            syncedAt: syncResult.syncedAt,
            action: FileAction.UPDATE_TRACKER,
            relativeSourcePath: operation.relativeSourcePath,
          };
          break;

        case FileAction.MERGE:
          try {
            logger.info(`Attempting AI merge for ${localPath}`);

            // Get model and API key from configuration
            const model = getOpenRouterModel();
            const apiKey = getOpenRouterApiKey();

            if (!model || !apiKey) {
              syncResult.success = false;
              syncResult.message =
                "AI merge failed: OpenRouter configuration not found. Run init-open-router command first.";
              break;
            }

            // Read source and local file contents
            const sourceContent = readFileSync(sourcePath, "utf-8");
            const localContent = readFileSync(localPath, "utf-8");

            // Use AI to merge the files
            const mergedContent = await aiMerge(
              localContent,
              sourceContent,
              model,
              apiKey
            );

            if (!mergedContent) {
              syncResult.success = false;
              syncResult.message =
                "AI merge failed: Could not generate merged content";
              break;
            }

            // Create a temporary backup of the local file
            const backupPath = `${localPath}.backup-${new Date().getTime()}`;
            copyFileSync(localPath, backupPath);
            logger.info(`Created backup of local file at ${backupPath}`);

            // Write the merged content to the local file
            writeFileSync(localPath, mergedContent);
            syncResult.success = true;
            syncResult.fileHash = getFileHash(localPath);
            syncResult.message = "Files merged successfully using AI";

            // Remove the backup file after successful merge
            try {
              unlinkSync(backupPath);
            } catch (e) {
              logger.warn(
                `Failed to remove backup file ${backupPath}: ${(e as Error).message}`
              );
            }

            // Update file data for tracking
            updatedFiles[repo][relativeLocalPath] = {
              hash: syncResult.fileHash,
              syncedAt: syncResult.syncedAt,
              action: FileAction.MERGE,
              relativeSourcePath: operation.relativeSourcePath,
            };
          } catch (e) {
            syncResult.success = false;
            syncResult.message = `AI merge failed: ${(e as Error).message}`;
          }
          break;

        default:
          syncResult.success = false;
          syncResult.message = `Unknown action: ${actionResult.action}`;
      }

      // Add the result to the results array
      results.push({
        operation,
        actionResult,
        syncResult,
        success: syncResult.success,
        message: syncResult.message,
        fileHash: syncResult.fileHash,
        syncedAt: syncResult.syncedAt,
      });
    } catch (e) {
      // Handle any errors during processing
      results.push({
        operation,
        actionResult: {
          action: FileAction.NONE,
          sourceFileHash: "",
          localFileHash: "",
          trackerFileHash: null,
        },
        syncResult: {
          success: false,
          message: `Error processing file: ${(e as Error).message}`,
        },
        success: false,
        message: `Error processing file: ${(e as Error).message}`,
      });
    }
  }

  return { updatedFiles, results };
}

/**
 * Generate a summary of sync operations
 * @param results Array of sync results
 * @returns Summary object with counts and details
 */
export function generateSyncSummary(results: FileSyncResult[]): SyncSummary {
  const summary: SyncSummary = {
    totalFiles: results.length,
    successCount: 0,
    failCount: 0,
    copyCount: 0,
    noneCount: 0,
    mergeCount: 0,
    updateTrackerCount: 0,
    failedFiles: [],
  };

  for (const result of results) {
    if (result.success) {
      summary.successCount++;
    } else {
      summary.failCount++;
      summary.failedFiles.push(result);
    }

    // Count by action type
    switch (result.actionResult.action) {
      case FileAction.COPY:
        summary.copyCount++;
        break;
      case FileAction.NONE:
        summary.noneCount++;
        break;
      case FileAction.MERGE:
        summary.mergeCount++;
        break;
      case FileAction.UPDATE_TRACKER:
        summary.updateTrackerCount++;
        break;
    }
  }

  return summary;
}

interface TreeNode {
  name: string;
  children: Map<string, TreeNode>;
  files: string[];
  action: FileAction;
}

/**
 * Builds a tree structure from file paths
 */
function buildTree(
  files: { path: string; action: FileAction }[]
): Map<FileAction, TreeNode> {
  const actionTrees = new Map<FileAction, TreeNode>();

  for (const { path, action } of files) {
    if (!actionTrees.has(action)) {
      actionTrees.set(action, {
        name: "",
        children: new Map(),
        files: [],
        action,
      });
    }

    const parts = path.split("/");
    const filename = parts.pop() || "";
    let currentNode = actionTrees.get(action)!;

    // Traverse or create the directory structure
    for (const part of parts) {
      if (!currentNode.children.has(part)) {
        currentNode.children.set(part, {
          name: part,
          children: new Map(),
          files: [],
          action,
        });
      }
      currentNode = currentNode.children.get(part)!;
    }

    // Add the file to the current directory
    if (filename) {
      currentNode.files.push(filename);
    }
  }

  return actionTrees;
}

/**
 * Formats a tree node and its children as a string
 */
function formatTreeNode(
  node: TreeNode,
  isLast: boolean,
  prefix: string[],
  output: string[]
): void {
  // Skip root node if it's empty
  if (node.name) {
    const connector = isLast ? "└── " : "├── ";
    output.push([...prefix, connector + node.name].join(""));
  }

  const newPrefix = [...prefix, isLast ? "    " : "│   "];

  // Process directories first
  const sortedDirs = Array.from(node.children.entries()).sort(
    ([nameA], [nameB]) => nameA.localeCompare(nameB)
  );

  for (let i = 0; i < sortedDirs.length; i++) {
    const dirEntry = sortedDirs[i];
    if (!dirEntry) continue;
    const [_, child] = dirEntry;
    const isLastChild = i === sortedDirs.length - 1 && node.files.length === 0;
    formatTreeNode(child, isLastChild, newPrefix, output);
  }

  // Then process files
  const sortedFiles = [...node.files].sort();
  for (let i = 0; i < sortedFiles.length; i++) {
    const isLastFile = i === sortedFiles.length - 1;
    const connector = isLastFile ? "└── " : "├── ";
    output.push([...newPrefix, connector + sortedFiles[i]].join(""));
  }
}

/**
 * Logs detailed information about file sync operations, grouped by action type
 */
export function logSyncDetails(results: FileSyncResult[]): void {
  if (!results.length) return;

  const output: string[] = ["File synchronization details:", "=".repeat(80)];

  // Prepare files for tree building
  const files = results
    .filter(result => result.actionResult.action !== FileAction.NONE)
    .map(result => ({
      path: result.operation.relativeLocalPath,
      action: result.actionResult.action,
    }));

  // Build tree structure
  const actionTrees = buildTree(files);

  // Sort actions for consistent output
  const sortedActions = Array.from(actionTrees.entries()).sort(
    ([actionA], [actionB]) => actionA.localeCompare(actionB)
  );

  // Generate output
  for (const actionTree of sortedActions) {
    if (!actionTree) continue;
    const [action, tree] = actionTree;
    output.push(`\n${action.toUpperCase()}:`);
    formatTreeNode(tree, true, [], output);
  }

  output.push("\n" + "=".repeat(80));
  logger.log(output.join("\n"));
}

/**
 * Log a summary of sync operations
 * @param summary Summary object
 * @param isRepoLevel Whether this is a repository-level summary (true) or overall summary (false)
 * @param repoName Optional repository name for repo-level summaries
 */
export function logSyncSummary(
  summary: SyncSummary,
  isRepoLevel: boolean = false,
  repoName?: string
): void {
  const scope = isRepoLevel && repoName ? `Repository ${repoName}` : "Overall";

  // Only log action breakdown, not the confusing summary line
  logger.success(
    `${scope} action breakdown: ${summary.copyCount} copied, ${summary.noneCount} unchanged, ${summary.mergeCount} need merge, ${summary.updateTrackerCount} tracker updates`
  );

  if (summary.failCount > 0) {
    logger.warn(
      `${isRepoLevel ? "Files" : "Files across all repositories"} with issues:`
    );
    summary.failedFiles.forEach(r => {
      const path = isRepoLevel
        ? r.operation.relativeLocalPath
        : `${r.operation.repo}/${r.operation.relativeLocalPath}`;
      logger.warn(
        `- ${path}: ${r.actionResult.action} - ${r.syncResult.message}`
      );
    });
  }
}
