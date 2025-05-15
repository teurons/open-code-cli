/**
 * Type definitions for task-specific interfaces
 */
import { ConfigObject } from "./common";

// Base interface for all task configurations
export interface BaseTaskConfig extends ConfigObject {
  // Add at least one property to avoid empty interface error
  [key: string]: unknown;
}

// AI Merge File task configuration
export interface AiMergeConfig extends BaseTaskConfig {
  targetFile: string;
  sourceFile: string;
  outputFile: string;
  model?: string;
  apiKey?: string;
  [key: string]: string | undefined;
}

// AI Content Merge task configuration
export interface AiContentMergeConfig extends BaseTaskConfig {
  [key: string]: ConfigObject[keyof ConfigObject];
}

// AI Modify File task configuration
export interface AiModifyFileConfig extends BaseTaskConfig {
  [key: string]: ConfigObject[keyof ConfigObject];
}

// Edit JSON task configuration
export interface EditJsonConfig extends BaseTaskConfig {
  [key: string]: ConfigObject[keyof ConfigObject];
}

// Execute task configuration
export interface ExecuteConfig extends BaseTaskConfig {
  [key: string]: ConfigObject[keyof ConfigObject];
}

// GitHub Fetch task configuration
export interface GhSyncConfig extends BaseTaskConfig {
  [key: string]: ConfigObject[keyof ConfigObject];
}

// Merge File task configuration
export interface MergeFileConfig extends BaseTaskConfig {
  [key: string]: ConfigObject[keyof ConfigObject];
}

// Merge TS File task configuration
export interface MergeTsFileConfig extends BaseTaskConfig {
  [key: string]: ConfigObject[keyof ConfigObject];
}

// NPM Command task configuration
export interface NpmCmdConfig extends BaseTaskConfig {
  [key: string]: ConfigObject[keyof ConfigObject];
}

// NPM Execute task configuration
export interface NpmExecuteConfig extends BaseTaskConfig {
  [key: string]: ConfigObject[keyof ConfigObject];
}

// NPM Install task configuration
export interface NpmInstallConfig extends BaseTaskConfig {
  [key: string]: ConfigObject[keyof ConfigObject];
}

// Patch File task configuration
export interface PatchFileConfig extends BaseTaskConfig {
  [key: string]: ConfigObject[keyof ConfigObject];
}

// Prompt task configuration
export interface PromptConfig extends BaseTaskConfig {
  [key: string]: ConfigObject[keyof ConfigObject];
}

// Write task configuration
export interface WriteConfig extends BaseTaskConfig {
  [key: string]: ConfigObject[keyof ConfigObject];
}

// AI Utils configuration
export interface AiUtilsConfig extends BaseTaskConfig {
  [key: string]: ConfigObject[keyof ConfigObject];
}
