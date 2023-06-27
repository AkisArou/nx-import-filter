import parser from '@typescript-eslint/parser';
import { TSESLint } from '@typescript-eslint/utils';
import { Linter } from '@typescript-eslint/utils/dist/ts-eslint';
import { RULE_NAME } from '@nx/eslint-plugin/src/rules/enforce-module-boundaries';
import { Logger } from './logger';

export function getEslintData(
  eslintConfig: Linter.Config,
  workspaceRoot: string,
  log: Logger
) {
  const linter = new TSESLint.Linter();
  const nxScopedRuleName = `@nx/${RULE_NAME}`;

  if (!eslintConfig.overrides) {
    log(`Could not find overrides in eslint config`);
    return;
  }

  let foundRuleEntry: Linter.RuleEntry | undefined;

  for (const override of eslintConfig.overrides) {
    if (override.rules && nxScopedRuleName in override.rules) {
      foundRuleEntry = override.rules[nxScopedRuleName];
    }
  }

  if (!foundRuleEntry) {
    log(`Could not find ${nxScopedRuleName} in eslint config`);
    return;
  }

  const baseConfig = {
    parser: '@typescript-eslint/parser',
    parserOptions: {
      ecmaVersion: 2018 as const,
      sourceType: 'module' as const,
    },
    rules: {
      [RULE_NAME]: foundRuleEntry,
    },
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (global as any).workspaceRoot = workspaceRoot;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (global as any).projectPath = workspaceRoot;

  linter.defineParser('@typescript-eslint/parser', parser);

  linter.defineRule(
    `${RULE_NAME}`,
    //@ts-expect-error No typings
    nxEslintPlugin['rules'][RULE_NAME]
  );

  return {
    linter,
    baseConfig,
  };
}
