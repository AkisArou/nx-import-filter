import path from "path";
import fs from "fs";
import ts from "typescript/lib/tsserverlibrary";
import { CommentObject, parse } from "comment-json";

type ProjectJsonPath = string & { __type: "project-json-path" };

function init(modules: { typescript: typeof ts }) {
  const ts = modules.typescript;

  function create(info: ts.server.PluginCreateInfo) {
    info.project.projectService.logger.info("Initializing nx-import-filter");

    const { paths, baseUrl } = info.project.getCompilerOptions();

    if (!paths) {
      info.project.projectService.logger.info("No paths configured");
      return;
    }

    if (!baseUrl) {
      info.project.projectService.logger.info("No baseUrl configured");
      return;
    }

    const workspaceRoot = ts.sys.resolvePath(baseUrl);
    ts.parseJsonText;

    const eslintConfig = parse(
      fs.readFileSync(path.join(workspaceRoot, ".eslintrc.json"), "utf-8")
    ) as {
      overrides?: {
        files: string;
        rules: Record<
          string,
          [
            string,
            {
              allow: string[];
              depConstraints: {
                sourceTag: string;
                onlyDependOnLibsWithTags: string[];
              }[];
            }
          ]
        >;
      }[];
    };

    const eslintRule = "@nx/enforce-module-boundaries";
    const enforceModuleBoundariesOverride = eslintConfig?.overrides?.find(
      (override) => override.rules[eslintRule]
    );

    if (!enforceModuleBoundariesOverride) {
      info.project.projectService.logger.info(
        "No @nx/enforce-module-boundaries configured"
      );
      return;
    }

    const [boundaryFiles, boundaries] =
      enforceModuleBoundariesOverride.rules[eslintRule];

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

      const tags = projectJson.tags as string[] | undefined;

      if (!tags) {
        continue;
      }

      tagsMap.set(projectJsonPath, {
        tags,
        source: key,
      });
    }

    tagsMap.forEach((val, key) => {
      console.log("TAGSSS", key, JSON.stringify(val));
      //Info 25   [22:20:18.266] TAGSSS, /home/akisarou/nx-testing/libs/ts-lib/project.json, {"tags":["app:assistant-volunteer"],"source":"@nx-testing/ts-lib"}
    });

    // Set up decorator object
    const proxy: ts.LanguageService = Object.create(null);
    for (let k of Object.keys(info.languageService) as Array<
      keyof ts.LanguageService
    >) {
      const x = info.languageService[k]!;
      // @ts-expect-error - JS runtime trickery which is tricky to type tersely
      proxy[k] = (...args: Array<{}>) => x.apply(info.languageService, args);
    }

    // Remove specified entries from completion list
    proxy.getCompletionsAtPosition = (fileName, position, options) => {
      const prior = info.languageService.getCompletionsAtPosition(
        fileName,
        position,
        options
      );

      const projectJsonPath = fileName
        .split("src")[0]
        .concat("project.json") as ProjectJsonPath;

      //Info 1196 [22:20:24.814] projectJsonPath: /home/akisarou/nx-testing/apps/nx-testing/project.json
      info.project.projectService.logger.info(
        `projectJsonPath: ${projectJsonPath}`
      );

      if (!prior) return;

      const found = tagsMap.get(projectJsonPath);

      info.project.projectService.logger.info(
        `FOUND: ${JSON.stringify(found)}`
      );

      info.project.projectService.logger.info(
        `fileName: ${fileName}, ${JSON.stringify(options)}`
      );

      info.project.projectService.logger.info(`isSame: ${!!found}`);

      prior.entries = prior.entries.filter((e) => {
        info.project.projectService.logger.info(`Entry: ${JSON.stringify(e)}`);
        // @nx-testing/ts-lib, app:assistant-volunteer
        //{"@nx-testing/ts-lib":["libs/ts-lib/src/index.ts"]}

        const isExport = e.kindModifiers === "export";

        // Info 6416 [19:07:11.002] Entry: {"name":"useEffect","kind":"function","kindModifiers":"declare","sortText":"16","source":"react","hasAction":true,"sourceDisplay":[{"text":"react","kind":"text"}],"data":{"exportName":"useEffect","exportMapKey":"useEffect|1916|","moduleSpecifier":"react","fileName":"/home/akisarou/vite-project/node_modules/@types/react/ts5.0/index.d.ts"}}
        // Info 13162[19:09:27.841] Entry: {"name":"Mine","kind":"function","kindModifiers":"export","sortText":"16","source":"./mine.ts","hasAction":true,"sourceDisplay":[{"text":"./mine.ts","kind":"text"}],"data":{"exportName":"Mine","exportMapKey":"Mine|9377|","moduleSpecifier":"./mine.ts","fileName":"/home/akisarou/vite-project/src/mine.ts"}}
        // Info 1383 [19:28:56.892] Entry: {"name":"tsLib","kind":"function","kindModifiers":"export","sortText":"16","source":"@nx-testing/ts-lib","hasAction":true,"sourceDisplay":[{"text":"@nx-testing/ts-lib","kind":"text"}],"data":{"exportName":"tsLib","exportMapKey":"tsLib|3683|","moduleSpecifier":"@nx-testing/ts-lib","fileName":"/home/akisarou/nx-testing/libs/ts-lib/src/index.ts"}}
        return !!found;
      });

      return prior;
    };

    return proxy;
  }

  return { create };
}

export = init;
