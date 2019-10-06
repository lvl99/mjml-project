#!/usr/bin/env node

import program, { Command } from "commander";
import processTemplates, { watchAndProcessFiles } from "./commands/process";

function collect(value: any, previous: any[] = []) {
  return previous.concat([value]);
}

program
  .command("process <target>")
  .option(
    "-t, --target <file_path_or_glob>",
    "Target template file path or glob to build",
    collect,
    []
  )
  .option(
    "-w, --watch",
    "Watch target(s) and related files for any changes and rebuild",
    false
  )
  .action((target: string, cmd: Command) => {
    const targets = target ? cmd.target.concat([target]) : cmd.target;

    if (cmd.watch) {
      watchAndProcessFiles({
        target: targets
      });
    } else {
      processTemplates({
        target: targets
      });
    }
  });

program.parse(process.argv);
