import { Task, TaskContext } from './types';
import { logger } from '../logger';
import { context } from '../context';
import { detect } from '@antfu/ni';
import { execSync } from 'child_process';

export class NpmInstallTask implements Task {
  public async execute(taskContext: TaskContext): Promise<void> {
    const { packages, dev = false, package_manager = 'auto', depends } = taskContext.config;
    const { cwd } = taskContext;

    // Check dependencies
    if (depends && Array.isArray(depends)) {
      for (const dep of depends) {
        if (!context.has(dep)) {
          throw new Error(`Missing dependency: ${dep}`);
        }
      }
    }

    // Prepare packages
    let pkgs: string[] = [];
    if (typeof packages === 'string') {
      pkgs = [packages];
    } else if (packages && Array.isArray(packages)) {
      pkgs = [...packages];
    }

    // Replace variables in packages
    const processedPackages = context.replaceVariablesInArray(pkgs);
    
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

    // Build the install command
    let installCmd: string;
    
    if (processedPackages.length === 0) {
      // Just install dependencies from package.json
      switch (pm) {
        case 'npm':
          installCmd = 'npm install';
          break;
        case 'pnpm':
          installCmd = 'pnpm install';
          break;
        case 'yarn':
          installCmd = 'yarn';
          break;
        default:
          installCmd = 'npm install';
      }
    } else {
      // Install specific packages
      const devFlag = dev ? ' -D' : '';
      
      switch (pm) {
        case 'npm':
          installCmd = `npm install${devFlag} ${processedPackages.join(' ')}`;
          break;
        case 'pnpm':
          installCmd = `pnpm add${devFlag} ${processedPackages.join(' ')}`;
          break;
        case 'yarn':
          installCmd = `yarn add${devFlag} ${processedPackages.join(' ')}`;
          break;
        default:
          installCmd = `npm install${devFlag} ${processedPackages.join(' ')}`;
      }
    }
    
    logger.info(`Installing packages with ${pm}: ${installCmd}`);
    
    try {
      execSync(installCmd, { stdio: 'inherit', cwd });
      logger.success('Packages installed successfully');
    } catch (e) {
      throw new Error(`Package installation failed: ${(e as Error).message}`);
    }
  }

  public validate(config: Record<string, any>): boolean {
    // Valid if packages is a string, an array, or not provided (for installing all dependencies)
    return typeof config.packages === 'undefined' || 
           typeof config.packages === 'string' || 
           (Array.isArray(config.packages) && config.packages.every(pkg => typeof pkg === 'string'));
  }
}
