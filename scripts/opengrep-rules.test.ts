import { describe, expect, test } from 'bun:test';
import { access, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';

const REPO_ROOT = join(import.meta.dir, "..");
const TEMPLATE_ROOT = join(import.meta.dir, "fixtures", "opengrep");
const OPENGREP_CONFIG_PATH = join(REPO_ROOT, "opengrep.yml");
const OPENGREP_SCAN_TIMEOUT_MS = 15_000;
const hasOpenGrep = Boolean(Bun.which("opengrep"));
const opengrepTest = hasOpenGrep ? test : test.skip;

type OpenGrepReport = {
  errors?: Array<{
    message: string;
    level?: string;
    rule_id?: string;
  }>;
  results: Array<{
    check_id: string;
    extra: {
      severity: "ERROR" | "WARNING" | "INFO";
    };
  }>;
};

type RuleCase = {
  ruleId: string;
  destinationPath: string;
  templatePath: string;
};

const positiveCases: RuleCase[] = [
  {
    ruleId: "cs-ts-no-eval",
    destinationPath: "apps/.opengrep-test-fixtures/eval-positive.ts",
    templatePath: "templates/eval-positive.ts.txt",
  },
  {
    ruleId: "cs-ts-no-new-function",
    destinationPath: "apps/.opengrep-test-fixtures/new-function-positive.ts",
    templatePath: "templates/new-function-positive.ts.txt",
  },
  {
    ruleId: "cs-ts-no-process-env-outside-approved-boundaries",
    destinationPath: "packages/.opengrep-test-fixtures/process-env-positive.ts",
    templatePath: "templates/process-env-positive.ts.txt",
  },
  {
    ruleId: "cs-ts-no-convex-browser-import-outside-db-boundary",
    destinationPath: "packages/.opengrep-test-fixtures/convex-browser-positive.ts",
    templatePath: "templates/convex-browser-positive.ts.txt",
  },
  {
    ruleId: "cs-db-set-admin-auth-only-in-db-client",
    destinationPath: "packages/.opengrep-test-fixtures/set-admin-auth-positive.ts",
    templatePath: "templates/set-admin-auth-positive.ts.txt",
  },
  {
    ruleId: "cs-api-no-eager-convex-admin-client",
    destinationPath: "apps/api/src/.opengrep-test-fixtures/eager-convex-client-positive.ts",
    templatePath: "templates/eager-convex-client-positive.ts.txt",
  },
  {
    ruleId: "cs-convex-no-fetch-in-mutation",
    destinationPath: "convex/.opengrep-test-fixtures/fetch-in-mutation-positive.ts",
    templatePath: "templates/fetch-in-mutation-positive.ts.txt",
  },
  {
    ruleId: "cs-convex-no-embedding-generation-in-mutation",
    destinationPath: "convex/.opengrep-test-fixtures/embedding-in-mutation-positive.ts",
    templatePath: "templates/embedding-in-mutation-positive.ts.txt",
  },
  {
    ruleId: "cs-api-products-service-must-use-actions-for-embedding-writes",
    destinationPath: "apps/api/src/services/.opengrep-test-fixtures/products-mutation-positive.ts",
    templatePath: "templates/products-mutation-positive.ts.txt",
  },
];

const negativeCases: RuleCase[] = [
  {
    ruleId: "cs-ts-no-eval",
    destinationPath: "apps/.opengrep-test-fixtures/clean-api-negative.ts",
    templatePath: "templates/clean-api-negative.ts.txt",
  },
  {
    ruleId: "cs-ts-no-new-function",
    destinationPath: "apps/.opengrep-test-fixtures/clean-api-negative.ts",
    templatePath: "templates/clean-api-negative.ts.txt",
  },
  {
    ruleId: "cs-ts-no-process-env-outside-approved-boundaries",
    destinationPath: "packages/.opengrep-test-fixtures/clean-package-negative.ts",
    templatePath: "templates/clean-package-negative.ts.txt",
  },
  {
    ruleId: "cs-ts-no-convex-browser-import-outside-db-boundary",
    destinationPath: "packages/db/src/.opengrep-test-fixtures/allowed-convex-browser-negative.ts",
    templatePath: "templates/allowed-convex-browser-negative.ts.txt",
  },
  {
    ruleId: "cs-db-set-admin-auth-only-in-db-client",
    destinationPath: "packages/db/src/.opengrep-test-fixtures/clean-db-admin-auth-negative.ts",
    templatePath: "templates/clean-db-admin-auth-negative.ts.txt",
  },
  {
    ruleId: "cs-api-no-eager-convex-admin-client",
    destinationPath: "apps/api/src/.opengrep-test-fixtures/lazy-convex-client-negative.ts",
    templatePath: "templates/lazy-convex-client-negative.ts.txt",
  },
  {
    ruleId: "cs-convex-no-fetch-in-mutation",
    destinationPath: "convex/.opengrep-test-fixtures/fetch-in-action-negative.ts",
    templatePath: "templates/fetch-in-action-negative.ts.txt",
  },
  {
    ruleId: "cs-convex-no-embedding-generation-in-mutation",
    destinationPath: "convex/.opengrep-test-fixtures/embedding-in-action-negative.ts",
    templatePath: "templates/embedding-in-action-negative.ts.txt",
  },
  {
    ruleId: "cs-api-products-service-must-use-actions-for-embedding-writes",
    destinationPath: "apps/api/src/services/.opengrep-test-fixtures/products-action-negative.ts",
    templatePath: "templates/products-action-negative.ts.txt",
  },
];

const allCases = [...positiveCases, ...negativeCases];

const getReferencedTemplatePaths = (): string[] =>
  [...new Set(allCases.map((ruleCase) => ruleCase.templatePath))];

const getReferencedRuleIds = (): string[] =>
  [...new Set(allCases.map((ruleCase) => ruleCase.ruleId))];

const extractRuleIdsFromConfig = async (): Promise<string[]> => {
  const config = await readFile(OPENGREP_CONFIG_PATH, "utf8");
  const matches = config.matchAll(/^\s*-\s+id:\s+(\S+)\s*$/gmu);

  return [...new Set([...matches].map((match) => match[1]))];
};

const toFixtureKey = (ruleId: string): string => ruleId.replaceAll(/[^a-z0-9-]/giu, "-");

const assertNoScanErrors = (report: OpenGrepReport, targetPath: string): void => {
  if (!report.errors || report.errors.length === 0) {
    return;
  }

  const formattedErrors = report.errors.map((error) =>
    error.rule_id ? `${error.rule_id}: ${error.message}` : error.message
  );

  throw new Error(
    `OpenGrep scan reported engine errors for ${targetPath}:\n${formattedErrors.join("\n")}`,
  );
};

const createFixture = async (
  ruleId: string,
  destinationPath: string,
  templatePath: string,
): Promise<{ cleanupRoot: string; targetPath: string }> => {
  const fixtureDirectory = join(dirname(destinationPath), toFixtureKey(ruleId));
  const fixturePath = join(fixtureDirectory, basename(destinationPath));
  const fullDestinationPath = join(REPO_ROOT, fixturePath);
  const fullTemplatePath = join(TEMPLATE_ROOT, templatePath);
  const cleanupRoot = join(REPO_ROOT, fixtureDirectory);

  await mkdir(dirname(fullDestinationPath), { recursive: true });
  await writeFile(fullDestinationPath, await readFile(fullTemplatePath, "utf8"));

  return {
    cleanupRoot,
    targetPath: fixturePath.replaceAll("\\", "/"),
  };
};

const runScan = async (targetPath: string): Promise<OpenGrepReport> => {
  const process = Bun.spawn(
    ["opengrep", "scan", "--config", "opengrep.yml", "--json", targetPath],
    {
      cwd: REPO_ROOT,
      stdout: "pipe",
      stderr: "pipe",
      stdin: "ignore",
    },
  );

  const stdout = await new Response(process.stdout).text();
  await new Response(process.stderr).text();
  const exitCode = await process.exited;

  if (exitCode !== 0) {
    throw new Error(`OpenGrep exited with code ${exitCode} while scanning ${targetPath}`);
  }

  const report = JSON.parse(stdout) as OpenGrepReport;
  assertNoScanErrors(report, targetPath);

  return report;
};

describe("OpenGrep rule regressions", () => {
  test("all referenced fixture templates exist", async () => {
    await Promise.all(
      getReferencedTemplatePaths().map(async (templatePath) => {
        await access(join(TEMPLATE_ROOT, templatePath));
      }),
    );
  });

  test("all referenced rule IDs are defined in opengrep.yml", async () => {
    const configuredRuleIds = new Set(await extractRuleIdsFromConfig());

    expect(getReferencedRuleIds().every((ruleId) => configuredRuleIds.has(ruleId))).toBe(true);
  });

  test("every rule in opengrep.yml has both a positive and a negative regression case", async () => {
    const configuredRuleIds = await extractRuleIdsFromConfig();
    const positiveRuleIds = new Set(positiveCases.map((ruleCase) => ruleCase.ruleId));
    const negativeRuleIds = new Set(negativeCases.map((ruleCase) => ruleCase.ruleId));

    expect(configuredRuleIds.every((ruleId) => positiveRuleIds.has(ruleId))).toBe(true);
    expect(configuredRuleIds.every((ruleId) => negativeRuleIds.has(ruleId))).toBe(true);
  });

  test("fails when a scan report contains engine errors", () => {
    expect(() =>
      assertNoScanErrors(
        {
          errors: [
            {
              message: "Rule parse failed",
              rule_id: "cs-ts-no-eval",
            },
            {
              message: "Scan timed out",
            },
          ],
          results: [],
        },
        "apps/.opengrep-test-fixtures/eval-positive.ts",
      ),
    ).toThrow(
      "OpenGrep scan reported engine errors for apps/.opengrep-test-fixtures/eval-positive.ts:\ncs-ts-no-eval: Rule parse failed\nScan timed out",
    );
  });

  for (const ruleCase of positiveCases) {
    opengrepTest(
      `${ruleCase.ruleId} matches its positive fixture`,
      { timeout: OPENGREP_SCAN_TIMEOUT_MS },
      async () => {
        const { cleanupRoot, targetPath } = await createFixture(
          ruleCase.ruleId,
          ruleCase.destinationPath,
          ruleCase.templatePath,
        );

        try {
          const report = await runScan(targetPath);

          expect(
            report.results.some((result) => result.check_id === ruleCase.ruleId),
          ).toBe(true);
        } finally {
          await rm(cleanupRoot, { recursive: true, force: true });
        }
      },
    );
  }

  for (const ruleCase of negativeCases) {
    opengrepTest(
      `${ruleCase.ruleId} ignores its negative fixture`,
      { timeout: OPENGREP_SCAN_TIMEOUT_MS },
      async () => {
        const { cleanupRoot, targetPath } = await createFixture(
          ruleCase.ruleId,
          ruleCase.destinationPath,
          ruleCase.templatePath,
        );

        try {
          const report = await runScan(targetPath);

          expect(
            report.results.some((result) => result.check_id === ruleCase.ruleId),
          ).toBe(false);
        } finally {
          await rm(cleanupRoot, { recursive: true, force: true });
        }
      },
    );
  }
});
