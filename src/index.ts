import path from "path";
import fs from "fs";
import ts from "typescript/lib/tsserverlibrary";
import { parse } from "comment-json";
import { TSESLint } from "@typescript-eslint/utils";
import * as parser from "@typescript-eslint/parser";
import * as nxEslintPlugin from "@nx/eslint-plugin";
import { Linter } from "@typescript-eslint/utils/dist/ts-eslint";
import { ensureGlobalProjectGraph } from "./ensure-global-project-graph";

function init(modules: { typescript: typeof ts }) {
  const ts = modules.typescript;

  function create(info: ts.server.PluginCreateInfo) {
    log(info, "Initializing nx-import-filter");

    const { baseUrl } = info.project.getCompilerOptions();

    if (!baseUrl) {
      log(info, "No baseUrl configured");
      return;
    }

    const workspaceRoot = ts.sys.resolvePath(baseUrl);

    log(info, `Workspace root -> ${workspaceRoot}`);

    const eslintConfigFiles = [
      ".eslintrc.json",
      ".eslintrc.js",
      ".eslintrc.cjs",
      "eslint.config.js",
    ];

    const foundEslintConfig = eslintConfigFiles.find((cf) =>
      fs.existsSync(path.join(workspaceRoot, cf))
    );

    if (!foundEslintConfig) {
      log(info, "No eslint configuration file found");
    }

    const eslintConfig = parse(
      fs.readFileSync(path.join(workspaceRoot, foundEslintConfig!), "utf-8")
    ) as Linter.Config;

    log(info, `Found eslint config: ${foundEslintConfig}`);

    const { linter, baseConfig } = getEslintData(eslintConfig, workspaceRoot);

    log(
      info,
      `${{
        projectGraph: (global as any).projectGraph,
        projectFileMap: (global as any).projectFileMap,
        projectRootMappings: (global as any).projectRootMappings,
        targetProjectLocator: (global as any).targetProjectLocator,
      }}`
    );

    const proxy = getProxy(info);

    // Remove specified entries from completion list
    proxy.getCompletionsAtPosition = (fileName, position, options) => {
      const prior = info.languageService.getCompletionsAtPosition(
        fileName,
        position,
        options
      );

      if (!prior) return;

      prior.entries = prior.entries.filter((entry) =>
        filterEntryByEslintRule(
          entry,
          linter,
          baseConfig,
          fileName /**, info */
        )
      );

      return prior;
    };

    return proxy;
  }

  return { create };
}

function filterEntryByEslintRule(
  entry: ts.CompletionEntry,
  linter: TSESLint.Linter,
  baseConfig: Linter.Config,
  fileName: string
  // info: ts.server.PluginCreateInfo
) {
  const canBeImported = entry.kindModifiers === "export";

  if (canBeImported) {
    const failures = linter.verify(
      `
      import '${entry.source}';
      import('${entry.source}');
     `,
      baseConfig,
      fileName
    );

    // log(
    //   info,
    //   `
    //   Importable entry:
    //   entry.name: ${entry.name}
    //   entry.source: ${entry.source}
    //   fileName: ${fileName}
    //   failures: ${JSON.stringify(failures)}
    // `
    // );

    return failures.length === 0;
  }

  return true;
}

function getEslintData(eslintConfig: Linter.Config, workspaceRoot: string) {
  const enforceModuleBoundariesRuleName = "enforce-module-boundaries";

  ensureGlobalProjectGraph(enforceModuleBoundariesRuleName);

  const linter = new TSESLint.Linter();
  const baseConfig = {
    parser: "@typescript-eslint/parser",
    parserOptions: {
      ecmaVersion: 2018 as const,
      sourceType: "module" as const,
    },
    rules: {
      [enforceModuleBoundariesRuleName]:
        eslintConfig.overrides![0].rules![
          `@nx/${enforceModuleBoundariesRuleName}`
        ],
    },
  };

  (global as any).workspaceRoot = workspaceRoot;
  (global as any).projectPath = workspaceRoot;

  linter.defineParser("@typescript-eslint/parser", parser);
  linter.defineRule(
    `${enforceModuleBoundariesRuleName}`,
    //@ts-expect-error
    nxEslintPlugin["rules"][enforceModuleBoundariesRuleName]
  );

  return {
    linter,
    baseConfig,
  };
}

function getProxy(info: ts.server.PluginCreateInfo) {
  // Set up decorator object
  const proxy: ts.LanguageService = Object.create(null);
  for (let k of Object.keys(info.languageService) as Array<
    keyof ts.LanguageService
  >) {
    const x = info.languageService[k]!;
    // @ts-expect-error - JS runtime trickery which is tricky to type tersely
    proxy[k] = (...args: Array<{}>) => x.apply(info.languageService, args);
  }

  return proxy;
}

function log(info: ts.server.PluginCreateInfo, text: string) {
  info.project.projectService.logger.info(`NX import filter: ${text}`);
}

export = init;
