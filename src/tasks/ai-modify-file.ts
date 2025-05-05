import { Task, TaskContext } from './types'
import { logger } from '../logger'
import { context } from '../context'
import { existsSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { getOpenRouterApiKey, getOpenRouterModel } from '../utils/config'
import { createOpenRouter } from '@openrouter/ai-sdk-provider'
import { generateText } from 'ai'

interface AiModifyFileConfig {
  path: string // Path to the file to be modified
  instruction: string // Instructions for AI to modify the file
  model?: string // AI model to use
  apiKey?: string // OpenRouter API key
}

/**
 * Task for modifying files based on AI instructions
 * Uses AI to understand the file and apply modifications based on provided instructions
 */
export class AiModifyFileTask implements Task {
  public async execute(taskContext: TaskContext): Promise<void> {
    const config = taskContext.config as AiModifyFileConfig
    const { cwd } = taskContext
    const { path: filePath, instruction, model: configModel, apiKey: configApiKey } = config

    // Get model from config or stored configuration
    const model = configModel || getOpenRouterModel()

    // Get API key from config, context, environment variable, or stored configuration
    let apiKey = configApiKey ? context.replaceVariables(configApiKey) : process.env.OPENROUTER_API_KEY || ''

    // If API key is not provided in the task or environment, try to get it from the stored configuration
    if (!apiKey) {
      apiKey = getOpenRouterApiKey()
    }

    if (!filePath) {
      throw new Error('path is required')
    }

    if (!instruction) {
      throw new Error('instruction is required')
    }

    // Replace variables in paths
    const processedFilePath = context.replaceVariables(filePath)
    const fullFilePath = join(cwd, processedFilePath)

    try {
      // Check if file exists
      if (!existsSync(fullFilePath)) {
        throw new Error(`File does not exist: ${fullFilePath}`)
      }

      // Read file content
      const fileContent = readFileSync(fullFilePath, 'utf-8')
      logger.info(`Using file: ${fullFilePath}`)

      // Use AI to modify the file based on instructions
      const modifiedContent = await this.performAiModify(fileContent, instruction, model, apiKey)

      if (!modifiedContent) {
        throw new Error(`AI modification failed for ${fullFilePath}`)
      }

      // Write the modified content back to the file
      writeFileSync(fullFilePath, modifiedContent)
      logger.success(`AI-modified content written to: ${fullFilePath}`)
    } catch (e) {
      throw new Error(`Failed to modify file: ${(e as Error).message}`)
    }
  }

  private async performAiModify(
    content: string,
    instruction: string,
    model: string,
    apiKey?: string,
  ): Promise<string | null> {
    if (!content) {
      logger.error('File content is required')
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

      const systemPrompt = this.getAiModifySystemPrompt()
      const userPrompt = this.getAiModifyUserPrompt(content, instruction)

      logger.info(`Sending modification request to AI model: ${model}`)

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
      logger.error(`AI modification failed: ${(error as Error).message}`)
      return null
    }
  }

  private getAiModifySystemPrompt(): string {
    return `You are an expert code modifier. 
Your task is to modify a file based on specific instructions.
Analyze the file to understand its structure and functionality, then apply the requested modifications.

Follow these rules:
1. Preserve the overall structure and functionality of the file
2. Make only the changes specified in the instructions
3. Ensure the modified code is functional and maintains the original intent
4. Return ONLY the complete modified file without any explanations or markdown formatting

Your output should be the complete, functional file with the requested modifications applied.`
  }

  private getAiModifyUserPrompt(content: string, instruction: string): string {
    return `I need to modify this file:

FILE CONTENT:
\`\`\`
${content}
\`\`\`

INSTRUCTIONS:
${instruction}

Please analyze the file and apply the requested modifications.
Return only the complete modified file without any explanations.`
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
    return typeof config === 'object' && typeof config.path === 'string' && typeof config.instruction === 'string'
  }
}
