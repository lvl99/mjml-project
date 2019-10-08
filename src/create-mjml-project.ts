#!/usr/bin/env node

import fs from "fs";
import path from "path";
import chalk from "chalk";
import {
  getExecDir,
  asyncCopyFiles,
  asyncReplaceText,
  asyncCheckFolderEmpty,
  asyncExec,
  asyncMakeDir
} from "./utils";

const { argv } = process;

// Will be executed from `dist` folder
const projectTemplatePath = path.join(__dirname, "../project");

export default async function createMjmlProject(
  name = "my-project",
  outputPath?: string
) {
  const execDir = await getExecDir();

  // Get the project's output path
  const projectOutputPath = outputPath
    ? path.isAbsolute(outputPath)
      ? outputPath
      : path.join(execDir, outputPath)
    : execDir.indexOf(name) > 0
    ? execDir
    : path.join(execDir, name);

  console.log(
    `${chalk.yellow("1/3")} Initialising ${chalk.bold(
      chalk.white(name)
    )} project folder...`
  );

  // Check that the output path exists and is empty
  if (!fs.existsSync(projectOutputPath)) {
    await asyncMakeDir(projectOutputPath).catch(err => {
      console.error(err.message);
      process.exit(1);
    });
  }
  await asyncCheckFolderEmpty(projectOutputPath).catch(err => {
    console.error(err.message);
    process.exit(1);
  });

  console.log(`${chalk.yellow("2/3")} Copying project files...`);

  // Copy the template project files
  await asyncCopyFiles(projectTemplatePath, projectOutputPath).catch(errs => {
    errs.map(err => console.error(err.message));
    process.exit(1);
  });

  // Replace placeholders in files
  await asyncReplaceText({
    files: `${path.join(projectOutputPath, "/package.json")}`,
    from: "%PROJECT_NAME%",
    to: name
  }).catch(err => {
    console.error(err.message);
    process.exit(1);
  });

  console.log(`${chalk.yellow("3/3")} Installing npm dependencies...`);

  // Install npm packages
  // @NOTE stupid core-js and their ads...
  await asyncExec("npm install --loglevel silent")
    .then(({ stdout, stderr }) => {
      if (stdout) {
        console.log("");
        console.log(stdout.trim());
      }
      if (stderr) {
        console.log("");
        console.error(stderr.trim());
      }
    })
    .catch(err => {
      console.error(err.message);
      process.exit(1);
    });

  console.log("");
  console.log(`✨ Successfully created new MJML project:`);
  console.log("");
  console.log(`${chalk.bold(chalk.white(projectOutputPath))}`);
  console.log("");
  console.log(`  → Process your MJML layouts into HTML:`);
  console.log(`    ${chalk.bold(chalk.green("npm run build"))}`);
  console.log("");
  console.log(`  → Serve and watch your files while you develop:`);
  console.log(`    ${chalk.bold(chalk.green("npm run watch"))}`);
  console.log("");
}

// node ./dist/create-mjml-project PROJECT_NAME [OUTPUT_PATH]
// npx create-mjml-project PROJECT_NAME [OUTPUT_PATH]
createMjmlProject(argv[2], argv[3]);
