import fs from "fs";
import path from "path";
import util from "util";
import childProcess from "child_process";
import glob from "glob";
import mkdirp from "mkdirp";
import readPkgUp from "read-pkg-up";
import { Options, ncp } from "ncp";
import replaceText from "replace-in-files";

export const asyncGlob = util.promisify(glob);
export const asyncReadFile = util.promisify(fs.readFile);
export const asyncWriteFile = util.promisify(fs.writeFile);
export const asyncMakeDir = util.promisify(mkdirp);
export const asyncReplaceText = replaceText;
export const asyncExec = util.promisify(childProcess.exec);

const DEFAULT_IGNORE_CONTENTS = [".idea", ".vscode", ".vs", ".git"];

export const asyncCheckFolderEmpty = (
  path: string,
  ignore: string[] = DEFAULT_IGNORE_CONTENTS
): Promise<void> =>
  new Promise((resolve, reject) => {
    fs.readdir(path, (err, files) => {
      if (err) {
        reject(err);
      }

      if (files.length) {
        const checkFiles = files.filter(file => !ignore.includes(file));
        if (checkFiles.length) {
          reject(new Error("Target folder is not empty"));
        }
      }

      resolve();
    });
  });

// Async wrapper for ncp
export const asyncCopyFiles = (
  source: string,
  destination: string,
  options?: Options
) =>
  new Promise((resolve, reject) => {
    ncp(source, destination, options || {}, err => {
      if (err) {
        reject(err);
      }
      resolve();
    });
  });

// Get the folder that the package.json file is
export async function getExecDir() {
  const execDir = process.cwd();

  const pkg = await readPkgUp({
    cwd: execDir,
    normalize: false
  });

  if (pkg && pkg.hasOwnProperty("path")) {
    return path.dirname(pkg.path);
  }

  return execDir;
}

export const log = (...args: any[]) => {
  console.log("[mjml-project]", ...args);
};

export const logWarn = (...args: any[]) => {
  console.warn("[mjml-project]", ...args);
};

export const logError = (...args: any[]) => {
  console.error("[mjml-project]", ...args);
};

export const logger = {
  log,
  warn: logWarn,
  error: logError
};
