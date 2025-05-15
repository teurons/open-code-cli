// Type imports only needed for type definitions

/**
 * Enum representing possible actions to take on a file during sync
 */
export enum FileAction {
  COPY = "copy", // Copy from source to local (only source changed)
  NONE = "none", // No action needed (no changes or only local changes)
  MERGE = "merge", // Need to merge changes (both source and local changed)
  UPDATE_TRACKER = "update_tracker", // Only update tracker hash, no file changes needed
}

/**
 * Result object from actionOnFile function
 */
export interface FileActionResult {
  action: FileAction;
  sourceFileHash: string;
  localFileHash: string;
  trackerFileHash: string | null;
}

/**
 * Represents a file sync operation
 */
export interface FileSyncOperation {
  sourcePath: string;
  localPath: string;
  repo: string;
  relativeSourcePath: string;
  relativeLocalPath: string;
}

/**
 * Result of a file sync operation
 */
export interface FileSyncResult {
  operation: FileSyncOperation;
  actionResult: FileActionResult;
  syncResult: {
    success: boolean;
    message?: string;
    fileHash?: string;
    syncedAt?: string;
  };
  success: boolean;
  message?: string;
  fileHash?: string;
  syncedAt?: string;
}

/**
 * Summary of sync operations
 */
export interface SyncSummary {
  totalFiles: number;
  successCount: number;
  failCount: number;
  copyCount: number;
  noneCount: number;
  mergeCount: number;
  updateTrackerCount: number;
  failedFiles: FileSyncResult[];
}

/**
 * Result of processing a repository
 */
export interface RepoProcessResult {
  repo: string;
  results: FileSyncResult[];
  success: boolean;
}
