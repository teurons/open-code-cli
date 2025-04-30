import { spawn, ChildProcess } from 'child_process';
import { Task, TaskContext } from './types';
import { logger } from '../logger';

export class ExecuteTask implements Task {
  public async execute(context: TaskContext): Promise<void> {
    const { config, cwd } = context;
    
    if (config.command) {
      await this.executeCommand(config.command, cwd);
    } else if (config.commands && Array.isArray(config.commands)) {
      for (const command of config.commands) {
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
      
      const [cmd, ...args] = command.split(' ');
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
