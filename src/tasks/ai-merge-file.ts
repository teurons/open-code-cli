import { Task, TaskContext } from './types'
import { logger } from '../logger'
import { context } from '../context'
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs'
import { join, dirname } from 'path'
import { createOpenRouter } from '@openrouter/ai-sdk-provider'
import { generateText } from 'ai'
import { getOpenRouterApiKey, getOpenRouterModel } from '../utils/config'

interface AiMergeConfig {
  targetFile: string // Path to the existing file
  sourceFile: string // Path to the file with new functionality
  outputFile: string // Path to the output file
  model?: string // AI model to use
  apiKey?: string // OpenRouter API key
}

/**
 * Task for intelligently merging files using AI to understand functionality
 * Uses AI to analyze both files and merge them with understanding of code context
 */
export class AiMergeFileTask implements Task {
  public async execute(taskContext: TaskContext): Promise<void> {
    const config = taskContext.config as AiMergeConfig
    const { cwd } = taskContext
    const {
      targetFile,
      sourceFile,
      outputFile,
      model: configModel,
      apiKey: configApiKey,
    } = config
    
    // Get model from config or stored configuration
    const model = configModel || getOpenRouterModel()

    // Get API key from config, context, environment variable, or stored configuration
    let apiKey = configApiKey ? context.replaceVariables(configApiKey) : process.env.OPENROUTER_API_KEY || ''
    
    // If API key is not provided in the task or environment, try to get it from the stored configuration
    if (!apiKey) {
      apiKey = getOpenRouterApiKey()
    }

    if (!targetFile) {
      throw new Error('targetFile is required')
    }

    if (!sourceFile) {
      throw new Error('sourceFile is required')
    }

    if (!outputFile) {
      throw new Error('outputFile is required')
    }

    // Replace variables in paths
    const processedTargetPath = context.replaceVariables(targetFile)
    const processedSourcePath = context.replaceVariables(sourceFile)
    const processedOutputPath = context.replaceVariables(outputFile)

    const fullTargetPath = join(cwd, processedTargetPath)
    const fullSourcePath = join(cwd, processedSourcePath)
    const fullOutputPath = join(cwd, processedOutputPath)

    try {
      // Check if source and target files exist
      if (!existsSync(fullTargetPath)) {
        throw new Error(`Target file does not exist: ${fullTargetPath}`)
      }

      if (!existsSync(fullSourcePath)) {
        throw new Error(`Source file does not exist: ${fullSourcePath}`)
      }

      // Create output directory if it doesn't exist
      const outputDir = dirname(fullOutputPath)
      if (!existsSync(outputDir)) {
        mkdirSync(outputDir, { recursive: true })
        logger.info(`Created directory: ${outputDir}`)
      }

      // Read source and target files
      const targetContent = readFileSync(fullTargetPath, 'utf-8')
      const sourceContent = readFileSync(fullSourcePath, 'utf-8')

      logger.info(`Using target file: ${fullTargetPath}`)
      logger.info(`Using source file: ${fullSourcePath}`)

      // Use AI to merge the files
      const mergedContent = await this.aiMerge(targetContent, sourceContent, model, apiKey)

      if (!mergedContent) {
        throw new Error(`AI merge failed for ${fullOutputPath}`)
      }

      // Write the merged content to the output file
      writeFileSync(fullOutputPath, mergedContent)
      logger.success(`AI-merged content written to: ${fullOutputPath}`)
    } catch (e) {
      throw new Error(`Failed to merge files: ${(e as Error).message}`)
    }
  }

  private async aiMerge(target: string, source: string, model: string, apiKey?: string): Promise<string | null> {
    if (!target || !source) {
      logger.error('Both target and source content are required')
      return null
    }

    try {
      if (!apiKey) {
        throw new Error(
          'OpenRouter API key is required. Set it in the task config, context, or as OPENROUTER_API_KEY environment variable.',
        )
      }

      const openrouter = createOpenRouter({
        apiKey,
      })

      const systemPrompt = this.getSystemPrompt()
      const userPrompt = this.getUserPrompt(target, source)

      logger.info(`Sending merge request to AI model: ${model}`)

      const { text } = await generateText({
        model: openrouter.chat(model),
        messages: [
          {
            role: 'system',
            content: systemPrompt,
          },
          {
            role: 'user',
            content: userPrompt,
          },
        ],
      })

      const response = text || ''
      logger.info('Received response from AI')

      // Extract code from response if it contains markdown code blocks
      const extractedCode = this.extractCodeFromResponse(response)

      return extractedCode || response
    } catch (error) {
      logger.error(`AI merge failed: ${(error as Error).message}`)
      return null
    }
  }

  private getSystemPrompt(): string {
    return `You are an expert code merger. 
Your task is to intelligently merge two versions of a file.
The first file (TARGET) is the existing file, and the second file (SOURCE) contains new functionality.
Analyze both files to understand their functionality and merge them intelligently.

Follow these rules:
1. Preserve all imports from both files, removing duplicates
2. Maintain the structure of the TARGET file when possible
3. Integrate functionality from the SOURCE file into the TARGET file
4. Resolve any conflicts by keeping the most comprehensive implementation
5. Ensure the merged code is functional and maintains the original intent of both files
6. Return ONLY the merged code without any explanations or markdown formatting

Your output should be a complete, functional file that combines the functionality of both input files.`
  }

  private getUserPrompt(target: string, source: string): string {
    return `I need to merge these two files:

TARGET FILE (existing file):
\`\`\`
${target}
\`\`\`

SOURCE FILE (new functionality to integrate):
\`\`\`
${source}
\`\`\`

Please analyze both files and create a merged version that intelligently combines their functionality.
Return only the merged code without any explanations.`
  }

  private extractCodeFromResponse(response: string): string | null {
    // Extract code from markdown code blocks if present
    const codeBlockRegex = /```(?:[\w]*)\n([\s\S]*?)```/g
    let match
    const matches = []

    while ((match = codeBlockRegex.exec(response)) !== null) {
      matches.push(match[1])
    }

    if (matches.length > 0) {
      // Join all code blocks if multiple are found
      return matches.join('\n\n')
    }

    return null
  }

  public validate(config: Record<string, any>): boolean {
    return (
      typeof config === 'object' &&
      typeof config.targetFile === 'string' &&
      typeof config.sourceFile === 'string' &&
      typeof config.outputFile === 'string'
    )
  }
}
