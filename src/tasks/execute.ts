import { spawn, ChildProcess } from 'child_process';
import { Task, TaskContext } from './types';
import { logger } from '../logger';
import { context } from '../context';

export class ExecuteTask implements Task {
  private taskContext: TaskContext | null = null;
  public async execute(taskContext: TaskContext): Promise<void> {
    this.taskContext = taskContext;
    const { config, cwd } = taskContext;
    const { depends } = config;
    
    // Check dependencies
    if (depends && Array.isArray(depends)) {
      for (const dep of depends) {
        if (!context.has(dep)) {
          throw new Error(`Missing dependency: ${dep}`);
        }
      }
    }
    
    if (config.command) {
      // Replace variables in command
      const processedCommand = context.replaceVariables(config.command);
      await this.executeCommand(processedCommand, cwd);
    } else if (config.commands && Array.isArray(config.commands)) {
      // Replace variables in commands
      const processedCommands = context.replaceVariablesInArray(config.commands);
      for (const command of processedCommands) {
        await this.executeCommand(command, cwd);
      }
    } else {
      throw new Error('Execute task requires either "command" or "commands" property');
    }
  }

  public validate(config: Record<string, any>): boolean {
    return Boolean(config.command || (config.commands && Array.isArray(config.commands)));
  }

  private executeCommand(command: string, cwd: string): Promise<void> {
    return new Promise((resolve, reject) => {
      logger.info(`Executing command: ${command}`);
      
      // Special handling for cd commands
      if (command.trim().startsWith('cd ')) {
        const dirPath = command.trim().substring(3).trim();
        if (dirPath) {
          try {
            // Update the working directory in the task runner
            if (this.taskContext && this.taskContext.updateWorkingDir) {
              this.taskContext.updateWorkingDir(dirPath);
              logger.success(`Changed directory to: ${dirPath}`);
              resolve();
              return;
            }
          } catch (error) {
            reject(new Error(`Failed to change directory: ${(error as Error).message}`));
            return;
          }
        }
      }
      
      // For non-cd commands, proceed with normal execution
      // Ensure cmd is not undefined
      const parts = command.split(' ');
      const cmd = parts[0];
      const args = parts.slice(1);
      
      if (!cmd) {
        reject(new Error('Empty command'));
        return;
      }
      
      const childProcess: ChildProcess = spawn(cmd, args, {
        cwd,
        stdio: 'inherit',
        shell: true
      });

      childProcess.on('close', (code: number | null) => {
        if (code === 0) {
          logger.success(`Command executed successfully: ${command}`);
          resolve();
        } else {
          const error = new Error(`Command failed with exit code ${code}: ${command}`);
          logger.error(error.message);
          reject(error);
        }
      });

      childProcess.on('error', (error: Error) => {
        logger.error(`Failed to execute command: ${command}`);
        logger.error(error.message);
        reject(error);
      });
    });
  }
}
