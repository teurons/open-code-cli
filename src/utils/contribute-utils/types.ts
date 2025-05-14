// Types imported in other files

/**
 * Interface for a sync operation from local to source
 */
export interface ContributeSyncOperation {
  /** Absolute path to the local file */
  absoluteLocalPath: string
  /** Absolute path to the source file in the temporary directory */
  absoluteSourcePath: string
  /** Relative path to the local file from the project root */
  relativeLocalPath: string
  /** Relative path to the source file from the repository root */
  relativeSourcePath: string
  /** Repository name */
  repo: string
}

/**
 * Interface for the result of a sync operation
 */
export interface ContributeSyncResult {
  /** The sync operation that was performed */
  operation: ContributeSyncOperation
  /** Whether the operation was successful */
  success: boolean
  /** Error message if the operation failed */
  error?: string
  /** The action that was performed (copy, skip) */
  action: 'copy' | 'skip'
}

/**
 * Interface for the summary of sync operations
 */
export interface ContributeSyncSummary {
  /** Number of files copied */
  copyCount: number
  /** Number of files skipped */
  skipCount: number
  /** Number of operations that failed */
  failCount: number
  /** Total number of operations */
  totalCount: number
}

/**
 * Interface for the configuration of a contribute operation
 */
export interface ContributeConfig {
  /** Whether to perform a dry run (don't actually copy files) */
  dryRun: boolean
  /** The branch name to create */
  branchName: string
  /** The commit message */
  commitMessage: string
  /** The PR title */
  prTitle: string
  /** The PR body */
  prBody: string
}

/**
 * Interface for the result of a contribute operation
 */
export interface ContributeResult {
  /** The repository that was contributed to */
  repo: string
  /** The fork repository that was used */
  forkRepo: string
  /** The branch name that was created */
  branchName: string
  /** The PR number if created */
  prNumber?: number
  /** The PR URL if created */
  prUrl?: string
  /** The sync results */
  syncResults: ContributeSyncResult[]
  /** Whether the operation was successful */
  success: boolean
}
