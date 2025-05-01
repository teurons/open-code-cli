import { Task, TaskContext } from './types';
import { logger } from '../logger';
import { context } from '../context';
import { execSync } from 'child_process';
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { dirname } from 'path';
import axios from 'axios';

interface FetchItem {
  repo: string;
  source: string;
  destination: string;
  type: 'file' | 'directory';
}

export class GhFetchTask implements Task {
  public async execute(taskContext: TaskContext): Promise<void> {
    const { items, depends } = taskContext.config;
    const { cwd } = taskContext;

    // Check dependencies
    if (depends && Array.isArray(depends)) {
      for (const dep of depends) {
        if (!context.has(dep)) {
          throw new Error(`Missing dependency: ${dep}`);
        }
      }
    }

    if (!items || !Array.isArray(items) || items.length === 0) {
      throw new Error('No fetch items provided');
    }

    for (const item of items) {
      const { repo, source, destination, type } = item as FetchItem;
      
      if (!repo || !source || !destination) {
        throw new Error('Invalid fetch item: repo, source, and destination are required');
      }

      // Replace variables in paths
      const processedRepo = context.replaceVariables(repo);
      const processedSource = context.replaceVariables(source);
      const processedDestination = context.replaceVariables(destination);
      
      logger.info(`Fetching ${type} from ${processedRepo}/${processedSource} to ${processedDestination}`);
      
      try {
        if (type === 'directory') {
          // Use giget for directories
          // Escape special characters in paths for shell safety
          const escapedSource = this.escapeShellArg(processedSource);
          const escapedDestination = this.escapeShellArg(processedDestination);
          
          const gigetCommand = `npx giget gh:${processedRepo}/${escapedSource} ${escapedDestination} --force`;
          logger.info(`Executing: ${gigetCommand}`);
          execSync(gigetCommand, { stdio: 'inherit', cwd });
        } else if (type === 'file') {
          // For files, fetch raw content from GitHub
          await this.fetchFile(processedRepo, processedSource, processedDestination, cwd);
        } else {
          throw new Error(`Invalid fetch type: ${type}. Must be 'file' or 'directory'`);
        }
        
        logger.success(`Successfully fetched ${type} to ${processedDestination}`);
      } catch (e) {
        throw new Error(`Failed to fetch ${type} from ${processedRepo}/${processedSource}: ${(e as Error).message}`);
      }
    }
  }

  /**
   * Escapes a string for safe use as a shell argument
   * Handles special characters like parentheses, spaces, etc.
   */
  private escapeShellArg(arg: string): string {
    // For paths with special characters, we need to escape them properly
    // This handles parentheses, spaces, and other special shell characters
    return `"${arg.replace(/"/g, '\\"')}"`;
  }

  private async fetchFile(repo: string, source: string, destination: string, cwd: string): Promise<void> {
    // Build raw GitHub URL
    const rawUrl = `https://raw.githubusercontent.com/${repo}/main/${source}`;
    
    try {
      // Fetch file content
      const response = await axios.get(rawUrl);
      const content = response.data;
      
      // Ensure destination directory exists
      const fullPath = `${cwd}/${destination}`;
      const dir = dirname(fullPath);
      
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }
      
      // Write file
      writeFileSync(fullPath, content);
      logger.info(`File written to ${fullPath}`);
    } catch (error) {
      throw new Error(`Failed to fetch file from ${rawUrl}: ${(error as Error).message}`);
    }
  }

  public validate(config: Record<string, any>): boolean {
    // Valid if items is an array of objects with repo, source, destination, and type properties
    return (
      Array.isArray(config.items) &&
      config.items.every((item: any) => 
        typeof item === 'object' &&
        typeof item.repo === 'string' &&
        typeof item.source === 'string' &&
        typeof item.destination === 'string' &&
        (item.type === 'file' || item.type === 'directory')
      )
    );
  }
}
