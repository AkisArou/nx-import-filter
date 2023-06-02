import path from "path";
import fs from "fs";
import ts from "typescript/lib/tsserverlibrary";
import { CommentObject, parse } from "comment-json";
import { TSESLint } from "@typescript-eslint/utils";
import * as parser from "@typescript-eslint/parser";
import * as nxEslintPlugin from "@nx/eslint-plugin";
import { Linter } from "@typescript-eslint/utils/dist/ts-eslint";

type ProjectJsonPath = string & { __type: "project-json-path" };

function log(info: ts.server.PluginCreateInfo, text: string) {
  info.project.projectService.logger.info(`NX import filter: ${text}`);
}

function init(modules: { typescript: typeof ts }) {
  const ts = modules.typescript;

  function create(info: ts.server.PluginCreateInfo) {
    log(info, "Initializing nx-import-filter");

    const { paths, baseUrl } = info.project.getCompilerOptions();

    if (!paths) {
      log(info, "No paths configured");
      return;
    }

    if (!baseUrl) {
      log(info, "No baseUrl configured");
      return;
    }

    const workspaceRoot = ts.sys.resolvePath(baseUrl);

    log(info, `Workspace root -> ${workspaceRoot}`);

    const eslintConfig = parse(
      fs.readFileSync(path.join(workspaceRoot, ".eslintrc.json"), "utf-8")
    ) as Linter.Config;

    log(info, "Found eslint config");

    const eslintRule = "@nx/enforce-module-boundaries";
    // const enforceModuleBoundariesOverride = eslintConfig?.overrides?.find(
    //   (override) => override?.rules?.[eslintRule]
    // );

    // if (!enforceModuleBoundariesOverride) {
    //   log(info, "No @nx/enforce-module-boundaries configured");
    //   return;
    // }

    // const rrr = enforceModuleBoundariesOverride.rules![eslintRule];

    // const [boundaryFiles, boundaries] = rrr;

    const tagsMap = new Map<
      ProjectJsonPath,
      { tags: string[]; source: string }
    >();

    for (const key in paths) {
      const val = paths[key];
      const curPath = val[0];
      const projectJsonPath = path.join(
        workspaceRoot,
        curPath.replace("src/index.ts", "project.json")
      ) as ProjectJsonPath;
      const projectJson = parse(
        fs.readFileSync(projectJsonPath, "utf-8")
      ) as CommentObject;

      log(info, `Found project.json path for path -> ${key}`);

      const tags = projectJson.tags as string[] | undefined;

      if (!tags) {
        log(info, `No tags for -> ${key}`);
        continue;
      }

      tagsMap.set(projectJsonPath, {
        tags,
        source: key,
      });
    }

    // Set up decorator object
    const proxy: ts.LanguageService = Object.create(null);
    for (let k of Object.keys(info.languageService) as Array<
      keyof ts.LanguageService
    >) {
      const x = info.languageService[k]!;
      // @ts-expect-error - JS runtime trickery which is tricky to type tersely
      proxy[k] = (...args: Array<{}>) => x.apply(info.languageService, args);
    }
    const enforceModuleBoundariesRuleName = "enforce-module-boundaries";

    const linter = new TSESLint.Linter({ cwd: workspaceRoot });
    const baseConfig = {
      ...eslintConfig,
      parser: "@typescript-eslint/parser",
      parserOptions: {
        ecmaVersion: 2018 as const,
        sourceType: "module" as const,
      },
    };

    log(
      info,
      `RULLLL
     
      create: ${JSON.stringify(
        //@ts-expect-error
        nxEslintPlugin["rules"][enforceModuleBoundariesRuleName].create
      )}
      ${JSON.stringify(
        //@ts-expect-error
        nxEslintPlugin["rules"][enforceModuleBoundariesRuleName]
      )} 
      `
      // ${JSON.stringify(nxEslintPlugin)}
    );

    linter.defineParser("@typescript-eslint/parser", parser);
    linter.defineRule(
      `${enforceModuleBoundariesRuleName}`,
      //@ts-expect-error
      nxEslintPlugin["rules"][enforceModuleBoundariesRuleName]
    );

    log(info, `RULLLS: ${JSON.stringify([...linter.getRules().values()])}`);

    // Remove specified entries from completion list
    proxy.getCompletionsAtPosition = (fileName, position, options) => {
      const prior = info.languageService.getCompletionsAtPosition(
        fileName,
        position,
        options
      );

      if (!prior) return;

      const projectJsonPath = fileName
        .split("src")[0]
        .concat("project.json") as ProjectJsonPath;

      const foundTagItem = tagsMap.get(projectJsonPath);

      log(
        info,
        `getting completions for fileName -> ${fileName}. Project.json path: ${projectJsonPath}. Tags found: ${!!foundTagItem} -> ${JSON.stringify(
          foundTagItem?.tags
        )}`
      );

      if (!foundTagItem) {
        return prior;
      }

      prior.entries = prior.entries.filter((e) => {
        const canBeImported = e.kindModifiers === "export";

        if (canBeImported) {
          const failures = linter.verify(
            `import {${e.name}} from "${e.source}";`,
            baseConfig,
            fileName
          );

          log(
            info,
            `entry for fileName -> ${fileName} -> name: ${e.name} source: ${
              e.source
            }. isExport: ${canBeImported} sss: import '${
              e.source
            }' e.data.fileName: ${e.data?.fileName} shape: ${JSON.stringify(e)}
            linter messages: ${JSON.stringify(failures)}
            `
          );
          return failures.length === 0;
          // info.project.projectService.logger.info(
          //   `ENTRY is Export: (${found.tags.some((t) => t === e.source)})
          //   source: ${JSON.stringify(found.source)}
          //   tags: ${JSON.stringify(found.tags)}
          //   entry: ${JSON.stringify(e)}`
          // );
          // for (const [_, value] of tagsMap) {
          //   const isSameSource = value.source === e.source;
          //   if (isSameSource) {
          //     log(info, `Same source: ${value.source}`);
          //     return true;
          //   }
          //   // return value.tags.some((t) => {
          //   //   return foundTagItem.tags.some((ft) => {
          //   //     log(info, `t: ${t} - ft: ${ft}`);
          //   //     return ft === t;
          //   //   });
          //   // });
          // }
        }

        return true;
      });

      return prior;
    };

    return proxy;
  }

  return { create };
}

export = init;
