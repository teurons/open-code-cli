import { Task, TaskContext } from "./types";
import { logger } from "../logger";
import { context } from "../context";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { getOpenRouterApiKey, getOpenRouterModel } from "../utils/config";
import { aiMerge, validateAiMergeConfig } from "../utils/ai-utils";
import { AiMergeConfig } from "../types/task-types";

// Interface is now imported from '../types/task-types'

/**
 * Task for intelligently merging files using AI to understand functionality
 * Uses AI to analyze both files and merge them with understanding of code context
 */
export class AiMergeFileTask implements Task {
  public async execute(taskContext: TaskContext): Promise<void> {
    const config = taskContext.config as AiMergeConfig;
    const { cwd } = taskContext;
    const {
      targetFile,
      sourceFile,
      outputFile,
      model: configModel,
      apiKey: configApiKey,
    } = config;

    // Get model from config or stored configuration
    const model = configModel || getOpenRouterModel();

    // Get API key from config, context, environment variable, or stored configuration
    let apiKey = configApiKey
      ? context.replaceVariables(configApiKey)
      : process.env.OPENROUTER_API_KEY || "";

    // If API key is not provided in the task or environment, try to get it from the stored configuration
    if (!apiKey) {
      apiKey = getOpenRouterApiKey();
    }

    if (!targetFile) {
      throw new Error("targetFile is required");
    }

    if (!sourceFile) {
      throw new Error("sourceFile is required");
    }

    if (!outputFile) {
      throw new Error("outputFile is required");
    }

    // Replace variables in paths
    const processedTargetPath = context.replaceVariables(targetFile);
    const processedSourcePath = context.replaceVariables(sourceFile);
    const processedOutputPath = context.replaceVariables(outputFile);

    const fullTargetPath = join(cwd, processedTargetPath);
    const fullSourcePath = join(cwd, processedSourcePath);
    const fullOutputPath = join(cwd, processedOutputPath);

    try {
      // Check if source and target files exist
      if (!existsSync(fullTargetPath)) {
        throw new Error(`Target file does not exist: ${fullTargetPath}`);
      }

      if (!existsSync(fullSourcePath)) {
        throw new Error(`Source file does not exist: ${fullSourcePath}`);
      }

      // Create output directory if it doesn't exist
      const outputDir = dirname(fullOutputPath);
      if (!existsSync(outputDir)) {
        mkdirSync(outputDir, { recursive: true });
        logger.info(`Created directory: ${outputDir}`);
      }

      // Read source and target files
      const targetContent = readFileSync(fullTargetPath, "utf-8");
      const sourceContent = readFileSync(fullSourcePath, "utf-8");

      logger.info(`Using target file: ${fullTargetPath}`);
      logger.info(`Using source file: ${fullSourcePath}`);

      // Use AI to merge the files
      const mergedContent = await this.performAiMerge(
        targetContent,
        sourceContent,
        model,
        apiKey
      );

      if (!mergedContent) {
        throw new Error(`AI merge failed for ${fullOutputPath}`);
      }

      // Write the merged content to the output file
      writeFileSync(fullOutputPath, mergedContent);
      logger.success(`AI-merged content written to: ${fullOutputPath}`);
    } catch (e) {
      throw new Error(`Failed to merge files: ${(e as Error).message}`);
    }
  }

  private async performAiMerge(
    target: string,
    source: string,
    model: string,
    apiKey?: string
  ): Promise<string | null> {
    return aiMerge(target, source, model, apiKey);
  }

  // These methods have been moved to utils/ai-utils.ts

  public validate(config: AiMergeConfig): boolean {
    return validateAiMergeConfig(config);
  }
}
