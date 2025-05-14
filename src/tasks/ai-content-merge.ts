import { Task, TaskContext } from './types'
import { TaskConfig as CommonTaskConfig } from '../types/common'
import { logger } from '../logger'
import { context } from '../context'
import { existsSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { getOpenRouterApiKey, getOpenRouterModel } from '../utils/config'
import { aiMerge } from '../utils/ai-utils'

interface AiContentMergeConfig {
  targetFile: string // Path to the file to be updated
  content: string // New content to merge into the target file
  model?: string // AI model to use
  apiKey?: string // OpenRouter API key
}

/**
 * Task for intelligently merging content into a file using AI
 * Uses AI to analyze both the existing file and new content to merge them with understanding of code context
 */
export class AiContentMergeTask implements Task {
  public async execute(taskContext: TaskContext): Promise<void> {
    const config = taskContext.config as AiContentMergeConfig
    const { cwd } = taskContext
    const { targetFile, content, model: configModel, apiKey: configApiKey } = config

    // Get model from config or stored configuration
    const model = configModel || getOpenRouterModel()

    // Get API key from config, context, environment variable, or stored configuration
    let apiKey = configApiKey
      ? context.replaceVariables(configApiKey)
      : process.env.OPENROUTER_API_KEY || ''

    // If API key is not provided in the task or environment, try to get it from the stored configuration
    if (!apiKey) {
      apiKey = getOpenRouterApiKey()
    }

    if (!targetFile) {
      throw new Error('targetFile is required')
    }

    if (!content) {
      throw new Error('content is required')
    }

    // Replace variables in paths
    const processedTargetPath = context.replaceVariables(targetFile)
    const fullTargetPath = join(cwd, processedTargetPath)

    try {
      // Check if target file exists
      if (!existsSync(fullTargetPath)) {
        throw new Error(`Target file does not exist: ${fullTargetPath}`)
      }

      // Read target file
      const targetContent = readFileSync(fullTargetPath, 'utf-8')
      logger.info(`Using target file: ${fullTargetPath}`)

      // Use AI to merge the content
      const mergedContent = await this.performAiMerge(targetContent, content, model, apiKey)

      if (!mergedContent) {
        throw new Error(`AI merge failed for ${fullTargetPath}`)
      }

      // Write the merged content back to the target file
      writeFileSync(fullTargetPath, mergedContent)
      logger.success(`AI-merged content written to: ${fullTargetPath}`)
    } catch (e) {
      throw new Error(`Failed to merge content: ${(e as Error).message}`)
    }
  }

  private async performAiMerge(
    target: string,
    source: string,
    model: string,
    apiKey?: string
  ): Promise<string | null> {
    return aiMerge(target, source, model, apiKey)
  }

  public validate(config: CommonTaskConfig): boolean {
    return (
      typeof config === 'object' &&
      typeof config.targetFile === 'string' &&
      typeof config.content === 'string'
    )
  }
}
