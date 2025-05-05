import { ArgumentsCamelCase, Argv } from 'yargs';
import { readFileSync } from 'fs';
import { isAbsolute, join } from 'path';
import * as process from 'node:process';
import { logger } from '../logger';

interface SerializeArgv {
  file: string;
  output: string;
}

export const command = 'serialize <file>';
export const describe = 'Serialize a file content for use in JSON files';
export const aliases = ['s'];

export function builder(yargs: Argv<SerializeArgv>): Argv {
  return yargs
    .positional('file', {
      type: 'string',
      description: 'Path to the file to serialize',
      demandOption: true,
    })
    .option('output', {
      alias: 'o',
      type: 'string',
      description: 'Output format: json, escaped, or raw',
      choices: ['json', 'escaped', 'raw'],
      default: 'json',
    })
    .coerce('file', (value: string) => {
      if (isAbsolute(value)) {
        return value;
      }
      return join(process.cwd(), value);
    });
}

export async function handler(argv: ArgumentsCamelCase<SerializeArgv>) {
  const { file, output } = argv;

  try {
    // Read the file content
    const content = readFileSync(file as string, 'utf-8');
    
    // Process the content based on the output format
    let serialized: string;
    
    switch (output) {
      case 'json':
        // Format for direct inclusion in JSON files
        serialized = JSON.stringify(content);
        break;
      
      case 'escaped':
        // Format with escaped newlines for string literals
        serialized = content
          .replace(/\\/g, '\\\\')  // Escape backslashes
          .replace(/"/g, '\\"')    // Escape double quotes
          .replace(/\n/g, '\\n')   // Escape newlines
          .replace(/\r/g, '\\r')   // Escape carriage returns
          .replace(/\t/g, '\\t');  // Escape tabs
        break;
      
      case 'raw':
      default:
        // Raw content
        serialized = content;
        break;
    }
    
    // Output the serialized content
    console.log(serialized);
    
  } catch (error) {
    logger.error(`Failed to serialize file: ${(error as Error).message}`);
    process.exit(1);
  }
}
