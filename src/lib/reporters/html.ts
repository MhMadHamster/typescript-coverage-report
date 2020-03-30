import React from "react";
import react from "react-dom/server";
import path from "path";
import fs from "fs";
import { promisify } from "util";
import { CoverageData } from "../getCoverage";
import SummaryPage from "../../components/SummaryPage";
import DetailPage from "../../components/DetailPage";

const writeFile = promisify(fs.writeFile);
const readFile = promisify(fs.readFile);
const mkdir = promisify(fs.mkdir);

export type Options = {
  outputDir: string;
  threshold: number;
};

const checkOrWriteFolder = (outputDir: string): string => {
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir);
  }

  return outputDir;
};

const includeAsset = (filename: string): string => {
  const extension = path.extname(filename);
  if (extension === ".js") {
    return `<script src="${filename}" type="text/javascript" charset="utf-8"></script>`;
  }

  if (extension === ".css") {
    return `<link href="${filename}" type="text/css" rel="stylesheet">`;
  }

  console.warn(`includeAsset: couldn't recognise the extension ${extension}`);

  return "";
};

const includeAssets = (assets: readonly string[]): string =>
  assets.map(includeAsset).join("\n");

const wrapHTMLContent = (
  Component: React.ElementType,
  props?: Record<string, any>,
  options:
    | {
        title?: string;
        assets?: string;
      }
    | undefined = {}
): string => {
  const content = react.renderToStaticMarkup(
    React.createElement(Component, props)
  );

  return `
  <!DOCTYPE html>
  <html>
    <head>
      <title>${options.title || "TypeScript coverage report"}</title>
      ${includeAsset(
        "https://cdn.jsdelivr.net/npm/semantic-ui@2.4.2/dist/semantic.min.css"
      )}
      ${options.assets || ""}
    </head>
    <body>
    ${content}
    <p class="footer-text">TypeScript Coverage Report generated by <a href="https://github.com/plantain-00/type-coverage">type-coverage</a> and <a href="https://github.com/alexcanessa/typescript-coverage-report">typescript-coverage-report</a> at ${new Date().toUTCString()}</p>
    </body>
  </html>
  `;
};

// NOTE: This generate function has side effect of creating the index.html
export const generate = async (
  data: CoverageData,
  options?: Options
): Promise<void> => {
  // NOTE: Create index file
  const fileContent = wrapHTMLContent(
    SummaryPage,
    {
      fileCounts: data.fileCounts,
      percentage: data.percentage,
      total: data.total,
      covered: data.covered,
      uncovered: data.uncovered,
      threshold: options.threshold
    },
    {
      assets: includeAssets(["./assets/source-file.css"])
    }
  );

  await writeFile(
    path.join(checkOrWriteFolder(options.outputDir), "index.html"),
    fileContent
  );

  // NOTE: Create the other files
  for (const [filename, { totalCount, correctCount }] of Array.from(
    data.fileCounts
  )) {
    await mkdir(path.join(options.outputDir, "files", path.dirname(filename)), {
      recursive: true
    });

    const annotations = data.anys.filter(({ file }) => file === filename);
    const assetsFolder = path.relative(filename, "assets");
    const sourceCode = await readFile(filename, "utf-8");
    const detailContent = wrapHTMLContent(
      DetailPage,
      {
        filename,
        sourceCode,
        totalCount,
        correctCount,
        annotations,
        threshold: options.threshold
      },
      {
        title: path.basename(filename),
        assets: includeAssets([
          "https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.52.2/codemirror.min.js",
          "https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.52.2/mode/javascript/javascript.min.js",
          "https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.52.2/codemirror.min.css",
          path.join(assetsFolder, "source-file.js"),
          path.join(assetsFolder, "source-file.css")
        ])
      }
    );

    await writeFile(
      path.join(options.outputDir, "files", `${filename}.html`),
      detailContent
    );
  }

  const generatedFile = path.resolve(
    path.join(options.outputDir, "index.html")
  );

  console.log(`View generated HTML Report at ${generatedFile}`);
};
