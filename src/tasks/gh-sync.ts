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
} from "../utils/gh-sync-utils";
import { RepoGroup, processRepo } from "../utils/gh-sync-utils/gh-sync-repo";
import { logger } from "../logger";

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

    const typedRepos = repos as unknown[] as RepoGroup[];
    const allResults: FileSyncResult[] = [];

    // Show repository selection prompt
    logger.info(
      "Select repositories to sync (use spacebar to select multiple, enter to confirm):"
    );

    const repoOptions = typedRepos.map(repoGroup => ({
      title: repoGroup.repo,
      value: repoGroup.repo,
    }));

    const selectedRepos = await logger.prompt("Choose repositories:", {
      type: "multiselect",
      options: repoOptions.map(opt => opt.title),
    });

    if (
      !selectedRepos ||
      !Array.isArray(selectedRepos) ||
      selectedRepos.length === 0
    ) {
      logger.info("No repositories selected. Exiting.");
      return;
    }

    const selectedReposSet = new Set(selectedRepos as string[]);
    const reposToProcess = typedRepos.filter(repoGroup =>
      selectedReposSet.has(repoGroup.repo)
    );

    // Process each selected repository
    for (const repoGroup of reposToProcess) {
      const { repo, files } = repoGroup;

      // Validate repository group structure
      validateRepositoryGroup(repo, files);

      // Replace variables in repo name
      const processedRepo = context.replaceVariables(repo);

      // Create a modified repoGroup with the processed repo name
      const processedRepoGroup = {
        ...repoGroup,
        repo: processedRepo,
      };

      // Process this repository and collect results
      const repoResult = await processRepo(processedRepoGroup, cwd);
      allResults.push(...repoResult.results);
    }

    // Only log overall summary if there are actual file operations
    if (allResults.length > 0) {
      // Generate and log overall summary
      // const overallSummary = generateSyncSummary(allResults);
      // logSyncSummary(overallSummary, false);
    }
  }

  // Using imported utility functions directly

  // Using imported utility functions for directory synchronization
}
