import { readCachedProjectGraph } from "@nx/devkit";
import { createProjectRootMappings } from "nx/src/project-graph/utils/find-project-for-path";
import { readNxJson } from "nx/src/project-graph/file-utils";
import { TargetProjectLocator } from "@nx/js/src/internal";
import { readProjectFileMapCache } from "nx/src/project-graph/nx-deps-cache";

const ESLINT_REGEX = /node_modules.*[\/\\]eslint$/;
const JEST_REGEX = /node_modules\/.bin\/jest$/; // when we run unit tests in jest
const NRWL_CLI_REGEX = /nx[\/\\]bin[\/\\]run-executor\.js$/;

export function isTerminalRun(): boolean {
  return (
    process.argv.length > 1 &&
    (!!process.argv[1].match(NRWL_CLI_REGEX) ||
      !!process.argv[1].match(JEST_REGEX) ||
      !!process.argv[1].match(ESLINT_REGEX) ||
      !!process.argv[1].endsWith("/bin/jest.js"))
  );
}

export function ensureGlobalProjectGraph(ruleName: string) {
  /**
   * Only reuse graph when running from terminal
   * Enforce every IDE change to get a fresh nxdeps.json
   */
  if (
    !(global as any).projectGraph ||
    !(global as any).projectRootMappings ||
    !(global as any).projectFileMap ||
    !isTerminalRun()
  ) {
    const nxJson = readNxJson();
    (global as any).workspaceLayout = nxJson.workspaceLayout;

    /**
     * Because there are a number of ways in which the rule can be invoked (executor vs ESLint CLI vs IDE Plugin),
     * the ProjectGraph may or may not exist by the time the lint rule is invoked for the first time.
     */
    try {
      const projectGraph = readCachedProjectGraph();
      (global as any).projectGraph = projectGraph;
      (global as any).projectRootMappings = createProjectRootMappings(
        projectGraph.nodes
      );
      (global as any).projectFileMap =
        readProjectFileMapCache()!.projectFileMap;
      (global as any).targetProjectLocator = new TargetProjectLocator(
        projectGraph.nodes,
        projectGraph.externalNodes!
      );
    } catch {
      process.stdout.write(
        `nx/enforce-module-boundaries: No cached ProjectGraph is available. The rule will be skipped.`
      );
    }
  }
}
