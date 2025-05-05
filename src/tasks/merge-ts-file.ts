import { Task, TaskContext } from './types'
import { TaskConfig as CommonTaskConfig } from '../types/common'
import { logger } from '../logger'
import { context } from '../context'
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs'
import { join, dirname } from 'path'
import * as ts from 'typescript'

interface MergeTsFile {
  path: string
  content: string
  strategy?: 'smart-merge' | 'import-merge' | 'export-merge'
  onConflict?: 'abort' | 'keep-target' | 'keep-source' | 'report'
}

/**
 * Task for merging TypeScript files with intelligent handling of imports, exports, etc.
 */
export class MergeTsFileTask implements Task {
  public async execute(taskContext: TaskContext): Promise<void> {
    const { files, depends } = taskContext.config as {
      files: MergeTsFile[]
      depends?: string[]
    }
    const { cwd } = taskContext

    // Check dependencies
    if (depends && Array.isArray(depends)) {
      for (const dep of depends) {
        if (!context.has(dep)) {
          throw new Error(`Missing dependency: ${dep}`)
        }
      }
    }

    if (!files || !Array.isArray(files) || files.length === 0) {
      throw new Error('No files specified for merging')
    }

    try {
      // Load TypeScript dynamically if needed
      // const ts = require('typescript');

      for (const file of files) {
        const { path, content, strategy = 'smart-merge' } = file

        if (!path) {
          throw new Error('File path is required')
        }

        if (!content) {
          throw new Error('Content is required for merge operation')
        }

        // Replace variables in path and content
        const processedPath = context.replaceVariables(path)
        const fullPath = join(cwd, processedPath)
        const processedContent = context.replaceVariables(content)

        try {
          // Create directory if it doesn't exist
          const dir = dirname(fullPath)
          if (!existsSync(dir)) {
            mkdirSync(dir, { recursive: true })
            logger.info(`Created directory: ${dir}`)
          }

          // Check if file exists
          let existingContent = ''
          if (!existsSync(fullPath)) {
            // Check if there's an original file with .original extension
            const originalPath = `${fullPath}.original`
            if (existsSync(originalPath)) {
              existingContent = readFileSync(originalPath, 'utf-8')
              logger.info(`Using original file as base: ${originalPath}`)
            } else {
              // File doesn't exist, just write the content
              writeFileSync(fullPath, processedContent)
              logger.success(`Created file: ${fullPath}`)
              continue
            }
          } else {
            existingContent = readFileSync(fullPath, 'utf-8')
          }

          // Handle according to strategy
          let mergedContent: string

          switch (strategy) {
            case 'import-merge':
              mergedContent = this.mergeImports(existingContent, processedContent)
              break

            case 'export-merge':
              mergedContent = this.mergeExports(existingContent, processedContent)
              break

            case 'smart-merge':
            default:
              mergedContent = this.smartMerge(existingContent, processedContent)
              break
          }

          writeFileSync(fullPath, mergedContent)
          logger.success(`Merged content into file: ${fullPath}`)
        } catch (e) {
          throw new Error(`Failed to merge file ${fullPath}: ${(e as Error).message}`)
        }
      }
    } catch (e) {
      throw new Error(`Failed to perform TypeScript merge: ${(e as Error).message}`)
    }
  }

  private smartMerge(target: string, source: string): string {
    // Parse both files using TypeScript compiler API
    const targetSourceFile = ts.createSourceFile('target.ts', target, ts.ScriptTarget.Latest, true)

    const sourceSourceFile = ts.createSourceFile('source.ts', source, ts.ScriptTarget.Latest, true)

    // Extract imports from both files
    const targetImports = this.extractImports(targetSourceFile)
    const sourceImports = this.extractImports(sourceSourceFile)

    // Merge imports
    const mergedImports = this.mergeImportStatements(targetImports, sourceImports)

    // Extract exports from both files
    const targetExports = this.extractExports(targetSourceFile)
    const sourceExports = this.extractExports(sourceSourceFile)

    // Merge exports
    const mergedExports = this.mergeExportStatements(targetExports, sourceExports)

    // Combine everything
    return this.combineContent(mergedImports, mergedExports, target, source)
  }

  private extractImports(sourceFile: ts.SourceFile): string[] {
    const imports: string[] = []

    ts.forEachChild(sourceFile, (node) => {
      if (ts.isImportDeclaration(node)) {
        imports.push(node.getText(sourceFile))
      }
    })

    return imports
  }

  private extractExports(sourceFile: ts.SourceFile): string[] {
    const exports: string[] = []

    ts.forEachChild(sourceFile, (node) => {
      if (
        (ts.isVariableStatement(node) && node.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)) ||
        (ts.isFunctionDeclaration(node) && node.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)) ||
        (ts.isClassDeclaration(node) && node.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)) ||
        (ts.isInterfaceDeclaration(node) && node.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)) ||
        (ts.isTypeAliasDeclaration(node) && node.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)) ||
        ts.isExportDeclaration(node)
      ) {
        exports.push(node.getText(sourceFile))
      }
    })

    return exports
  }

  private mergeImportStatements(targetImports: string[], sourceImports: string[]): string[] {
    // Simple deduplication for now
    const mergedImports = [...targetImports]

    for (const sourceImport of sourceImports) {
      if (!targetImports.includes(sourceImport)) {
        mergedImports.push(sourceImport)
      }
    }

    return mergedImports
  }

  private mergeExportStatements(targetExports: string[], sourceExports: string[]): string[] {
    // Simple deduplication for now
    const mergedExports = [...targetExports]

    for (const sourceExport of sourceExports) {
      if (!targetExports.includes(sourceExport)) {
        mergedExports.push(sourceExport)
      }
    }

    return mergedExports
  }

  private combineContent(imports: string[], exports: string[], targetContent: string, sourceContent: string): string {
    // Remove imports and exports from target content
    let cleanedTargetContent = targetContent

    for (const importStmt of this.extractImports(
      ts.createSourceFile('target.ts', targetContent, ts.ScriptTarget.Latest, true),
    )) {
      cleanedTargetContent = cleanedTargetContent.replace(importStmt, '')
    }

    for (const exportStmt of this.extractExports(
      ts.createSourceFile('target.ts', targetContent, ts.ScriptTarget.Latest, true),
    )) {
      cleanedTargetContent = cleanedTargetContent.replace(exportStmt, '')
    }

    // Remove imports and exports from source content
    let cleanedSourceContent = sourceContent

    for (const importStmt of this.extractImports(
      ts.createSourceFile('source.ts', sourceContent, ts.ScriptTarget.Latest, true),
    )) {
      cleanedSourceContent = cleanedSourceContent.replace(importStmt, '')
    }

    for (const exportStmt of this.extractExports(
      ts.createSourceFile('source.ts', sourceContent, ts.ScriptTarget.Latest, true),
    )) {
      cleanedSourceContent = cleanedSourceContent.replace(exportStmt, '')
    }

    // Combine everything
    return [...imports, '', cleanedTargetContent.trim(), '', cleanedSourceContent.trim(), '', ...exports].join('\n')
  }

  private mergeImports(target: string, source: string): string {
    // Parse both files
    const targetSourceFile = ts.createSourceFile('target.ts', target, ts.ScriptTarget.Latest, true)

    const sourceSourceFile = ts.createSourceFile('source.ts', source, ts.ScriptTarget.Latest, true)

    // Extract imports from both files
    const targetImports = this.extractImports(targetSourceFile)
    const sourceImports = this.extractImports(sourceSourceFile)

    // Merge imports
    const mergedImports = this.mergeImportStatements(targetImports, sourceImports)

    // Replace imports in target
    let result = target

    // Remove all existing imports
    for (const importStmt of targetImports) {
      result = result.replace(importStmt, '')
    }

    // Add all merged imports at the beginning
    result = mergedImports.join('\n') + '\n\n' + result.trim()

    return result
  }

  private mergeExports(target: string, source: string): string {
    // Similar to mergeImports but for exports
    // Parse both files
    const targetSourceFile = ts.createSourceFile('target.ts', target, ts.ScriptTarget.Latest, true)

    const sourceSourceFile = ts.createSourceFile('source.ts', source, ts.ScriptTarget.Latest, true)

    // Extract exports from both files
    const targetExports = this.extractExports(targetSourceFile)
    const sourceExports = this.extractExports(sourceSourceFile)

    // Merge exports
    const mergedExports = this.mergeExportStatements(targetExports, sourceExports)

    // Replace exports in target
    let result = target

    // Remove all existing exports
    for (const exportStmt of targetExports) {
      result = result.replace(exportStmt, '')
    }

    // Add all merged exports at the end
    result = result.trim() + '\n\n' + mergedExports.join('\n')

    return result
  }

  public validate(config: CommonTaskConfig): boolean {
    return (
      Array.isArray(config.files) &&
      config.files.every(
        (file: unknown) =>
          typeof file === 'object' && typeof file.path === 'string' && typeof file.content === 'string',
      )
    )
  }
}
