import path from "path";
import fs from "fs";
import mjml from "mjml";
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
  DataUpdated
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

export default async function processFiles({
  target = "templates/**/*.mjml",
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
        : // Default to `templates/**/*.mjml` if no targets were given
          ["templates/**/*.mjml"]
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
  const sharedDataPath = path.join(execDir, "data", "shared.json");
  const sharedData = fs.existsSync(sharedDataPath)
    ? require(sharedDataPath)
    : {};

  const filesBeingProcessed: Promise<ProcessedFile>[] = matches.map(
    async inputPath => {
      const filePath = path.isAbsolute(inputPath)
        ? inputPath
        : path.join(execDir, inputPath);
      const templateDir = path
        .dirname(filePath)
        .replace(path.join(execDir, "templates"), "");
      const templateBaseName = path.basename(filePath).replace(/\.mjml$/, "");

      const dataDir = path.join(execDir, "data", templateDir);

      const outputDir = path.join(buildDir, templateDir);
      const outputPath = path.join(outputDir, `${templateBaseName}.html`);

      // Read MJML file
      const mjmlContent = await asyncReadFile(filePath)
        .then(content => content.toString("utf8"))
        .catch(err => {
          output.error(`Error when reading ${filePath}:`);
          output.error(err);

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
        filePath: execDir,
        // @ts-ignore Remove this when MJML types have been updated
        mjmlConfigPath: execDir,
        validationLevel: "strict"
      });

      if (errors.length) {
        output.error(`Found errors in MJML:\n${errors.join("\n")}`);

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
      const templateHtml = twig({
        data: html
      });

      // Get shared template data as well as specific template data to interpolate
      const sharedTemplateDataPath = path.join(dataDir, "shared.json");
      const templateDataPath = path.join(dataDir, `${templateBaseName}.json`);
      const templateData = {
        ...sharedData,
        ...(fs.existsSync(sharedTemplateDataPath)
          ? require(sharedTemplateDataPath)
          : {}),
        ...(fs.existsSync(templateDataPath) ? require(templateDataPath) : {})
      };

      const renderedHtml = await templateHtml
        .renderAsync(templateData)
        .catch(err => {
          output.error("Error occurred when Twig was rendering file:");
          output.error(err);

          if (!watch) {
            process.exit(1);
          }

          return html;
        });

      // Create the output folder if it doesn't already exist
      if (!fs.existsSync(outputDir)) {
        await asyncMakeDir(outputDir).catch(err => {
          output.error("Error occurred when creating the output folder:");
          output.error(err);

          if (!watch) {
            process.exit(1);
          }
        });
      }

      await asyncWriteFile(outputPath, renderedHtml, "utf8").catch(err => {
        output.error("Error occurred when writing rendered template file:");
        output.error(err);

        if (!watch) {
          process.exit(1);
        }
      });

      const processedFile: ProcessedFile = {
        inputPath: filePath,
        outputPath,
        errors,
        data: templateData,
        html: renderedHtml
      };

      return processedFile;
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
      output.error(err);

      if (!watch) {
        process.exit(1);
      }
    });

  return processingFiles;
}

export async function watchAndProcessFiles({
  target = "templates/**/*.mjml"
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
            targetPath = path.join(execDir, "templates", "**/*.mjml");
          }

          await processFiles({
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

  _target.forEach(targetGlob => {
    logger.log(`Watching ${path.relative(execDir, targetGlob)}`);

    // Watch each template glob for changes
    bs.watch(
      targetGlob,
      {
        cwd: execDir
      },
      async (event, file) => {
        switch (event) {
          case "change":
            await processFiles({
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
