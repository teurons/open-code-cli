import { ArgumentsCamelCase, Argv } from "yargs";
import { handleContributeCommand } from "../utils/contribute-utils/contribute-handler";

interface ContributeArgv {
  dryRun?: boolean;
}

export const command = "contribute";
export const describe = "Contribute changes from local to source repositories";
export const aliases = ["c"];

export function builder(yargs: Argv<ContributeArgv>): Argv {
  return yargs.option("dry-run", {
    alias: "d",
    type: "boolean",
    description: "Perform a dry run without making any changes",
    default: false,
  });
}

export async function handler(argv: ArgumentsCamelCase<ContributeArgv>) {
  await handleContributeCommand({
    dryRun: argv.dryRun,
  });
}
