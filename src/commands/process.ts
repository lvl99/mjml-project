import path from "path";
import fs from "fs";
import mjml from "mjml";
import { registerComponent } from "mjml-core";
import { hasMagic } from "glob";
import { twig } from "twig";
import browserSync, { BrowserSyncInstance } from "browser-sync";
import {
  getExecDir,
  asyncGlob,
  asyncMakeDir,
  asyncReadFile,
  asyncWriteFile,
  logger
} from "../utils";

enum Status {
  Processed,
  Updated,
  DataUpdated,
  OtherUpdated
}

interface MJMLParseError {
  line: number;
  message: string;
  tagName: string;
  formattedMessage: string;
}

export interface ProcessedFile {
  inputPath: string;
  outputPath: string;
  html: string;
  data?: { [keyword: string]: any };
  errors?: MJMLParseError[];
}

let alreadySetupProject = 0;

export default async function processFiles({
  target = "layouts/**/*.mjml",
  watch = false,
  status = Status.Processed,
  bs
}: {
  target: string | string[];
  watch?: boolean;
  status?: Status;
  bs?: BrowserSyncInstance;
}): Promise<void | ProcessedFile[]> {
  const execDir = await getExecDir();
  const buildDir = path.join(execDir, "build");
  const output = watch ? logger : console;

  if (!fs.existsSync(buildDir)) {
    await asyncMakeDir(buildDir);
  }

  const _target =
    target instanceof Array
      ? target.length
        ? target
        : // Default to `layouts/**/*.mjml` if no targets were given
          ["layouts/**/*.mjml"]
      : [target];

  const _matches = await Promise.all(
    _target.map(async targetInput => {
      // Not a glob
      if (!hasMagic(targetInput)) {
        if (path.isAbsolute(targetInput)) {
          return [targetInput];
        } else {
          return [path.join(execDir, targetInput)];
        }
      }
      // Is a glob
      else {
        return await asyncGlob(targetInput, {
          root: execDir
        });
      }
    })
  );
  const matches = _matches.reduce(
    (acc, matchedPaths) =>
      matchedPaths.length ? acc.concat(matchedPaths.filter(Boolean)) : acc,
    []
  );

  // Get data stored in `/data/shared.json` (if it exists)
  const projectDataPath = path.join(execDir, "data", "shared.json");
  const projectData = fs.existsSync(projectDataPath)
    ? require(projectDataPath)
    : {};

  // Register components into MJML
  // @TODO only register component if hasn't been registered
  // @TODO if watched component file changed, re-register component
  try {
    // @TODO figure out how to get @babel/register to work and remove
    // the `build:components` script
    // const setupProjectPath = path.join(execDir, "setupProject.js");
    // if (fs.existsSync(setupProjectPath)) {
    //   output.log(`Setting up project: ${setupProjectPath}`);
    //   try {
    //     require(setupProjectPath);
    //   } catch (err) {
    //     output.error("Error occurred when setting up project:");
    //     output.error(err.stack);
    //     process.exit(1);
    //   }
    // }

    const components = await asyncGlob("components/**/*.js", {
      root: execDir
    });

    components.forEach(componentPath => {
      const componentModule = require(path.join(execDir, componentPath));
      registerComponent(componentModule);
      output.log(`Registered ${componentPath}`);
    });
  } catch (err) {
    output.error(`Error when registering components in MJML:`);
    output.error(err.stack);
    process.exit(1);
  }

  const filesBeingProcessed: Promise<ProcessedFile>[] = matches.map(
    async inputPath => {
      const filePath = path.isAbsolute(inputPath)
        ? inputPath
        : path.join(execDir, inputPath);

      const layoutDir = path
        .dirname(filePath)
        .replace(path.join(execDir, "layouts"), "");

      const layoutBaseName = path.basename(filePath).replace(/\.mjml$/, "");

      const outputDir = path.join(buildDir, layoutDir);
      const outputPath = path.join(outputDir, `${layoutBaseName}.html`);

      const dataDir = path.join(execDir, "data", layoutDir);

      // Get shared folder data as well as specific layout data to interpolate
      const sharedDataPath = path.join(dataDir, "shared.json");
      const layoutDataPath = path.join(dataDir, `${layoutBaseName}.json`);
      const layoutData = {
        ...projectData,
        ...(fs.existsSync(sharedDataPath) ? require(sharedDataPath) : {}),
        ...(fs.existsSync(layoutDataPath) ? require(layoutDataPath) : {})
      };

      try {
        // Read MJML file
        const mjmlContent = await asyncReadFile(filePath)
          .then(content => content.toString("utf8"))
          .catch(err => {
            output.error(`Error when reading ${filePath}:`);
            output.error(err.stack);

            if (!watch) {
              process.exit(1);
            }
          });

        if (!mjmlContent) {
          const processedFile: ProcessedFile = {
            inputPath: filePath,
            outputPath,
            errors: [
              {
                line: 0,
                message: `Failed to read ${filePath}`,
                tagName: "",
                formattedMessage: `Failed to read ${filePath}`
              }
            ],
            data: {},
            html: ""
          };

          return processedFile;
        }

        // Convert MJML to HTML
        const { html, errors } = mjml(mjmlContent, {
          minify: true,
          keepComments: false,
          filePath,
          // @ts-ignore Remove this when MJML types have been updated
          mjmlConfigPath: execDir,
          validationLevel: "soft"
        });

        if (errors.length) {
          output.error(
            `Found errors in MJML:\n${errors
              .map(err => err.formattedMessage)
              .join("\n")}`
          );

          if (!watch) {
            process.exit(1);
          }

          const processedFile: ProcessedFile = {
            inputPath: filePath,
            outputPath,
            errors,
            data: {},
            html: ""
          };

          return processedFile;
        }

        // Use Twig.js to do any other further operations, like variable interpolation
        // @TODO feature flag
        // @TODO support other templating languages
        const layoutHtml = twig({
          data: html
        });

        const renderedHtml = await layoutHtml
          .renderAsync(layoutData)
          .catch(err => {
            output.error("Error occurred when Twig was rendering file:");
            output.error(err.stack);

            if (!watch) {
              process.exit(1);
            }

            return html;
          });

        // Create the output folder if it doesn't already exist
        if (!fs.existsSync(outputDir)) {
          await asyncMakeDir(outputDir).catch(err => {
            output.error("Error occurred when creating the output folder:");
            output.error(err.stack);

            if (!watch) {
              process.exit(1);
            }
          });
        }

        await asyncWriteFile(outputPath, renderedHtml, "utf8").catch(err => {
          output.error("Error occurred when writing rendered layout file:");
          output.error(err.stack);

          if (!watch) {
            process.exit(1);
          }
        });

        const processedFile: ProcessedFile = {
          inputPath: filePath,
          outputPath,
          errors,
          data: layoutData,
          html: renderedHtml
        };

        return processedFile;
      } catch (err) {
        if (!watch) {
          throw new Error(`${filePath}:\n${err.stack}`);
        }

        return {
          inputPath: filePath,
          outputPath,
          errors: [
            {
              line: 0,
              message: err.message,
              tagName: "",
              formattedMessage: `Processing error found in ${filePath}:\n${err.stack}`
            }
          ],
          data: {},
          html: ""
        };
      }
    }
  );

  const processingFiles = Promise.all(filesBeingProcessed)
    .then(processedFiles => {
      processedFiles.forEach(({ outputPath }) => {
        // Output a different message depending on the process status type
        switch (status) {
          case Status.Updated:
            output.log(`Updated ${outputPath}`);
            break;

          case Status.DataUpdated:
            output.log(`Updated data for ${outputPath}`);
            break;

          case Status.OtherUpdated:
            output.log(`Updated dependent file for ${outputPath}`);
            break;

          default:
          case Status.Processed:
            output.log(`Processed ${outputPath}`);
            break;
        }
      });

      if (bs) {
        bs.reload(
          processedFiles
            .reduce(
              (acc: string[], { outputPath, errors }) =>
                !errors || !errors.length ? acc.concat([outputPath]) : acc,
              []
            )
            .filter(Boolean)
        );
      }

      return processedFiles;
    })
    .catch(err => {
      output.error("Error occurred when processing files:");
      output.error(err.stack);

      if (!watch) {
        process.exit(1);
      }
    });

  return processingFiles;
}

export async function watchAndProcessFiles({
  target = "layouts/**/*.mjml"
}: {
  target: string | string[];
}) {
  const execDir = await getExecDir();

  const _target = target instanceof Array ? target : [target];

  const bs = browserSync.create();

  // Watch any data JSON file for changes
  bs.watch(
    "data/**/*.json",
    {
      cwd: execDir
    },
    async (event, file) => {
      logger.log(`Detected event "${event}" in ${file}`);

      switch (event) {
        case "change":
          let targetPath = "";

          if (path.basename(String(file)) !== "shared.json") {
            targetPath = path.join(
              execDir,
              path
                .dirname(String(file))
                .replace(path.join(execDir, "data"), ""),
              `${path.basename(String(file)).replace(/\.json$/, "")}.mjml`
            );

            // @TODO check if template file still exists?
          }
          // If shared data is updated, update all the templates within using a glob
          else {
            targetPath = path.join(execDir, "layouts", "**/*.mjml");
          }

          processFiles({
            target: targetPath,
            status: Status.DataUpdated,
            watch: true,
            bs
          });

          break;

        default:
      }
    }
  );

  // Watch all other files
  bs.watch(
    "{partials,components,public}/**/*",
    {
      cwd: execDir
    },
    async (event, file) => {
      logger.log(`Detected event "${event}" in ${file}`);

      switch (event) {
        case "change":
          processFiles({
            target: "layouts/**/*.mjml",
            status: Status.OtherUpdated,
            watch: true,
            bs
          });

          break;

        default:
      }
    }
  );

  // Watch layouts
  _target.forEach(targetGlob => {
    logger.log(`Watching ${path.relative(execDir, targetGlob)}`);

    // Watch each target glob for changes
    bs.watch(
      targetGlob,
      {
        cwd: execDir
      },
      async (event, file) => {
        logger.log(`Detected event "${event}" in ${file}`);

        switch (event) {
          case "change":
            processFiles({
              target: String(file),
              status: Status.Updated,
              watch: true,
              bs
            });
            break;

          default:
        }
      }
    );
  });

  try {
    await processFiles({
      target,
      watch: true,
      status: Status.Processed,
      bs
    });

    bs.init({
      server: {
        baseDir: path.join(execDir, "build"),
        directory: true,
        routes: {
          "/fonts": "public/fonts",
          "/images": "public/images",
          "/styles": "public/styles"
        }
      },
      reloadOnRestart: true,
      reloadThrottle: 1000,
      watchEvents: ["change"]
    });
  } catch (err) {
    logger.error("Error occurred when watching files for changes:");
    logger.error(err);
    process.exit(1);
  }
}
