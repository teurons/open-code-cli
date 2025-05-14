import fs from 'fs'
import path from 'path'
import os from 'os'
import { logger } from '../logger'

// Configuration directory path
const CONFIG_DIR = path.join(os.homedir(), '.open-code-cli')
const OPENROUTER_CONFIG_FILE = path.join(CONFIG_DIR, 'openrouter.json')

interface OpenRouterConfig {
  apiKey: string
  model: string
}

/**
 * Ensures the configuration directory exists
 */
function ensureConfigDir(): void {
  if (!fs.existsSync(CONFIG_DIR)) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true })
  }
}

/**
 * Saves OpenRouter configuration to the config file
 */
export function saveOpenRouterConfig(config: OpenRouterConfig): void {
  try {
    ensureConfigDir()
    fs.writeFileSync(OPENROUTER_CONFIG_FILE, JSON.stringify(config, null, 2))
    logger.success('OpenRouter configuration saved successfully')
  } catch (error) {
    logger.error(`Failed to save OpenRouter configuration: ${(error as Error).message}`)
    throw error
  }
}

/**
 * Reads OpenRouter configuration from the config file
 */
export function readOpenRouterConfig(): OpenRouterConfig | null {
  try {
    if (!fs.existsSync(OPENROUTER_CONFIG_FILE)) {
      return null
    }

    const configData = fs.readFileSync(OPENROUTER_CONFIG_FILE, 'utf-8')
    return JSON.parse(configData) as OpenRouterConfig
  } catch (error) {
    logger.error(`Failed to read OpenRouter configuration: ${(error as Error).message}`)
    return null
  }
}

/**
 * Gets the OpenRouter API key from config file or environment variable
 */
export function getOpenRouterApiKey(): string {
  const config = readOpenRouterConfig()
  return config?.apiKey || process.env.OPENROUTER_API_KEY || ''
}

/**
 * Gets the OpenRouter model from config file or returns default
 */
export function getOpenRouterModel(
  defaultModel = 'mistralai/mistral-small-3.1-24b-instruct:free'
): string {
  const config = readOpenRouterConfig()
  return config?.model || defaultModel
}
