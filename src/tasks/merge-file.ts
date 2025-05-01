import { Task, TaskContext } from './types';
import { logger } from '../logger';
import { context } from '../context';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';

interface MergeFile {
  path: string;
  content: string;
  strategy?: 'replace' | 'smart-merge';
  onConflict?: 'abort' | 'keep-target' | 'keep-source' | 'report';
}

/**
 * Task for merging content into files with conflict resolution
 * Similar to git merge but simplified for workflow automation
 */
export class MergeFileTask implements Task {
  public async execute(taskContext: TaskContext): Promise<void> {
    const { files, depends } = taskContext.config as {
      files: MergeFile[];
      depends?: string[];
    };
    const { cwd } = taskContext;

    // Check dependencies
    if (depends && Array.isArray(depends)) {
      for (const dep of depends) {
        if (!context.has(dep)) {
          throw new Error(`Missing dependency: ${dep}`);
        }
      }
    }

    if (!files || !Array.isArray(files) || files.length === 0) {
      throw new Error('No files specified for merging');
    }

    for (const file of files) {
      const { path, content, strategy = 'smart-merge', onConflict = 'report' } = file;
      
      if (!path) {
        throw new Error('File path is required');
      }

      if (!content) {
        throw new Error('Content is required for merge operation');
      }

      // Replace variables in path and content
      const processedPath = context.replaceVariables(path);
      const fullPath = join(cwd, processedPath);
      const processedContent = context.replaceVariables(content);
      
      try {
        // Create directory if it doesn't exist
        const dir = dirname(fullPath);
        if (!existsSync(dir)) {
          mkdirSync(dir, { recursive: true });
          logger.info(`Created directory: ${dir}`);
        }

        // Check if file exists
        if (!existsSync(fullPath)) {
          // File doesn't exist, just write the content
          writeFileSync(fullPath, processedContent);
          logger.success(`Created file: ${fullPath}`);
          continue;
        }

        // File exists, handle according to strategy
        const existingContent = readFileSync(fullPath, 'utf-8');

        if (strategy === 'replace') {
          // Just replace the file
          writeFileSync(fullPath, processedContent);
          logger.success(`Replaced file: ${fullPath}`);
        } else if (strategy === 'smart-merge') {
          // Perform a smart merge
          const mergedContent = this.smartMerge(existingContent, processedContent, onConflict);
          
          if (mergedContent === null) {
            // Conflict detected and onConflict is set to abort
            throw new Error(`Merge conflict detected in ${fullPath} and onConflict is set to abort`);
          }
          
          writeFileSync(fullPath, mergedContent);
          logger.success(`Merged content into file: ${fullPath}`);
        }
      } catch (e) {
        throw new Error(`Failed to merge file ${fullPath}: ${(e as Error).message}`);
      }
    }
  }

  private smartMerge(target: string, source: string, onConflict: string): string | null {
    // Split both files into lines
    const targetLines = target.split('\\n');
    const sourceLines = source.split('\\n');
    
    // If the files are identical, return the target
    if (target === source) {
      return target;
    }
    
    // Simple line-by-line comparison
    // This is a very basic implementation and could be improved
    const result: string[] = [];
    const targetLineSet = new Set(targetLines);
    
    // First, add all source lines that don't conflict
    for (const line of sourceLines) {
      if (!targetLineSet.has(line) || line.trim() === '') {
        result.push(line);
      }
    }
    
    // Check if we have conflicts
    const hasConflicts = result.length !== sourceLines.length;
    
    if (hasConflicts) {
      switch (onConflict) {
        case 'abort':
          return null;
        case 'keep-target':
          return target;
        case 'keep-source':
          return source;
        case 'report':
          logger.warn(`Merge conflicts detected, using source content as fallback`);
          return source;
        default:
          return source;
      }
    }
    
    return result.join('\\n');
  }

  public validate(config: Record<string, any>): boolean {
    return (
      Array.isArray(config.files) &&
      config.files.every((file: any) => 
        typeof file === 'object' &&
        typeof file.path === 'string' &&
        typeof file.content === 'string'
      )
    );
  }
}
