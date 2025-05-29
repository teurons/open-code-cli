import { ArgumentsCamelCase, Argv } from "yargs";
import { handleContributeCommand } from "../utils/contribute-utils/contribute-handler";
import { logger } from "../logger";
import { red } from "picocolors";

interface ContributeArgv {
  dryRun?: boolean;
}

export const command = "gh-contribute";
export const describe =
  "Contribute changes from local to GitHub source repositories";

export const aliases = ["ghc"];

export function builder(yargs: Argv<ContributeArgv>): Argv {
  return yargs.option("dry-run", {
    alias: "d",
    type: "boolean",
    description: "Perform a dry run without making any changes",
    default: false,
  });
}

export async function handler(argv: ArgumentsCamelCase<ContributeArgv>) {
  try {
    await handleContributeCommand({
      dryRun: argv.dryRun,
    });
  } catch (error) {
    logger.error(red(`Error in gh-contribute: ${(error as Error).message}`));
    process.exit(1);
  }
}
