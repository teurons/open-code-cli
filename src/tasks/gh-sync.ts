import { Task, TaskContext } from "./types";
import { TaskConfig as CommonTaskConfig } from "../types/common";
import { context } from "../context";
import { readTrackerConfig, writeTrackerConfig } from "../utils/tracker";
import {
  validateDependencies,
  validateReposConfiguration,
  validateRepositoryGroup,
  validateGhSyncConfig,
  FileSyncResult,
  generateSyncSummary,
  logSyncSummary,
} from "../utils/gh-sync-utils";
import { RepoGroup, processRepo } from "../utils/gh-sync-utils/gh-sync-repo";

export class GhSyncTask implements Task {
  /**
   * Validate the task configuration
   * @param config The task configuration
   * @returns Whether the configuration is valid
   */
  validate(config: CommonTaskConfig): boolean {
    return validateGhSyncConfig(config);
  }
  // updateDirectoryFileHashes method removed as it's no longer needed
  /**
   * Execute the GitHub fetch task
   * @param taskContext The task context containing configuration and working directory
   */
  public async execute(taskContext: TaskContext): Promise<void> {
    const { repos, depends } = taskContext.config;
    const { cwd } = taskContext;

    // Initialize tracker file if it doesn't exist
    const trackerConfig = readTrackerConfig(cwd);
    writeTrackerConfig(cwd, trackerConfig);

    // Check dependencies and validate repos configuration
    validateDependencies(depends);
    validateReposConfiguration(repos as unknown[]);

    const typedRepos = repos as unknown[];
    const allResults: FileSyncResult[] = [];

    // Process each repository group directly
    for (const repoGroup of typedRepos) {
      const typedRepoGroup = repoGroup as RepoGroup;
      const { repo, files } = typedRepoGroup;

      // Validate repository group structure
      validateRepositoryGroup(repo, files);

      // Replace variables in repo name
      const processedRepo = context.replaceVariables(repo);

      // Create a modified repoGroup with the processed repo name
      const processedRepoGroup = {
        ...typedRepoGroup,
        repo: processedRepo,
      };

      // Process this repository and collect results
      const repoResult = await processRepo(processedRepoGroup, cwd);
      allResults.push(...repoResult.results);
    }

    // Only log overall summary if there are actual file operations
    if (allResults.length > 0) {
      // Generate and log overall summary
      const overallSummary = generateSyncSummary(allResults);
      logSyncSummary(overallSummary, false);
    }
  }

  // Using imported utility functions directly

  // Using imported utility functions for directory synchronization
}
