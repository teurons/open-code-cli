import { createOpenRouter } from '@openrouter/ai-sdk-provider'
import { generateText } from 'ai'
import { logger } from '../logger'
import { TaskConfig } from '../types/common'

/**
 * Gets the system prompt for AI code merging
 */
export function getAiMergeSystemPrompt(): string {
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

/**
 * Gets the user prompt for AI code merging
 */
export function getAiMergeUserPrompt(target: string, source: string): string {
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

/**
 * Extracts code from a response that may contain markdown code blocks
 */
export function extractCodeFromResponse(response: string): string | null {
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

/**
 * Validates AI merge configuration
 */
export function validateAiMergeConfig(config: TaskConfig): boolean {
  return (
    typeof config === 'object' &&
    typeof config.targetFile === 'string' &&
    typeof config.sourceFile === 'string' &&
    typeof config.outputFile === 'string'
  )
}

/**
 * Performs AI-powered code merging
 */
export async function aiMerge(
  target: string,
  source: string,
  model: string,
  apiKey?: string
): Promise<string | null> {
  if (!target || !source) {
    logger.error('Both target and source content are required')
    return null
  }

  try {
    if (!apiKey) {
      throw new Error(
        'OpenRouter API key is required. Set it in the task config, context, or as OPENROUTER_API_KEY environment variable.'
      )
    }

    const openrouter = createOpenRouter({
      apiKey,
    })

    const systemPrompt = getAiMergeSystemPrompt()
    const userPrompt = getAiMergeUserPrompt(target, source)

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
    const extractedCode = extractCodeFromResponse(response)

    return extractedCode || response
  } catch (error) {
    logger.error(`AI merge failed: ${(error as Error).message}`)
    return null
  }
}
