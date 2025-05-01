import { Task, TaskContext } from './types';
import { logger } from '../logger';
import { context } from '../context';
import { detect } from '@antfu/ni';
import { execSync } from 'child_process';
// No color imports needed

export class NpmCommandTask implements Task {
  public async execute(taskContext: TaskContext): Promise<void> {
    const { command, commands, package_manager = 'auto', depends } = taskContext.config;
    const { cwd } = taskContext;

    // Check dependencies
    if (depends && Array.isArray(depends)) {
      for (const dep of depends) {
        if (!context.has(dep)) {
          throw new Error(`Missing dependency: ${dep}`);
        }
      }
    }

    // Prepare commands
    let cmds: string[] = [];
    if (command) {
      cmds = [command];
    } else if (commands && Array.isArray(commands)) {
      cmds = [...commands];
    }

    if (cmds.length === 0) {
      throw new Error('NpmCommand task requires either "command" or "commands" property');
    }

    // Replace variables in commands
    const processedCommands = context.replaceVariablesInArray(cmds);
    
    // Detect package manager
    let pm = package_manager;
    if (pm === 'auto') {
      try {
        pm = await detect({ cwd }) || 'npm';
        logger.success(`Detected package manager: ${pm}`);
      } catch (e) {
        logger.warn(`Failed to detect package manager, using npm: ${(e as Error).message}`);
        pm = 'npm';
      }
    }

    // Execute commands with the appropriate package manager prefix
    for (const cmd of processedCommands) {
      // Transform the command based on the package manager
      const finalCmd = this.transformCommand(cmd, pm);
      
      logger.info(`Executing: ${finalCmd}`);
      
      try {
        execSync(finalCmd, { stdio: 'inherit', cwd });
        logger.success(`Command completed successfully`);
      } catch (e) {
        throw new Error(`Command failed: ${(e as Error).message}`);
      }
    }
  }

  public validate(config: Record<string, any>): boolean {
    return Boolean(config.command || (config.commands && Array.isArray(config.commands)));
  }

  private transformCommand(command: string, packageManager: string): string {
    // Handle package manager specific command transformations
    if (command.startsWith('create ')) {
      // create-* commands
      const createCmd = command.substring(7);
      switch (packageManager) {
        case 'npm':
          return `npx ${createCmd}`;
        case 'pnpm':
          return `pnpm create ${createCmd}`;
        case 'yarn':
          return `yarn create ${createCmd}`;
        default:
          return `npx ${createCmd}`;
      }
    } else if (command.includes('@latest')) {
      // Commands with @latest (like shadcn@latest)
      if (packageManager === 'pnpm') {
        return `pnpm dlx ${command}`;
      } else if (packageManager === 'yarn') {
        return `yarn dlx ${command}`;
      } else {
        return `npx ${command}`;
      }
    }
    
    // Return the command as is if no transformation is needed
    return command;
  }
}
