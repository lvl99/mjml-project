#!/usr/bin/env node

import path from "path";
import {
  getExecDir,
  asyncCopyFiles,
  asyncReplaceText,
  asyncCheckFolderEmpty,
  asyncExec
} from "./utils";

const { argv } = process;

// Will be executed from `dist` folder
const projectTemplatePath = path.join(__dirname, "../project");

export default async function createMjmlProject(
  name: string = "my-project",
  outputPath: string = "."
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

  // Check that the output path is empty
  await asyncCheckFolderEmpty(projectOutputPath).catch(err => {
    console.error(err.message);
    process.exit(1);
  });

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

  // Install npm packages
  // @NOTE stupid core-js and their ads...
  await asyncExec("npm install --loglevel silent")
    .then(({ stdout, stderr }) => {
      if (stdout) {
        console.log(stdout);
      }
      if (stderr) {
        console.error(stderr);
      }
    })
    .catch(err => {
      console.error(err.message);
      process.exit(1);
    });

  console.log(`Created new MJML project ${name} at ${projectOutputPath}`);
}

// node ./dist/create-mjml-project PROJECT_NAME [OUTPUT_PATH]
// npx create-mjml-project PROJECT_NAME [OUTPUT_PATH]
createMjmlProject(argv[2], argv[3]);
