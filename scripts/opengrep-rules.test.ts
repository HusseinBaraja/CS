import { afterEach, describe, expect, test } from 'bun:test';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

const REPO_ROOT = join(import.meta.dir, "..");
const TEMPLATE_ROOT = join(import.meta.dir, "fixtures", "opengrep");
const hasOpenGrep = Boolean(Bun.which("opengrep"));
const opengrepTest = hasOpenGrep ? test : test.skip;

type OpenGrepReport = {
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

const cleanupRoots = new Set<string>();

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
  {
    ruleId: "cs-api-no-eager-r2-storage-client",
    destinationPath: "apps/api/src/services/.opengrep-test-fixtures/eager-storage-positive.ts",
    templatePath: "templates/eager-storage-positive.ts.txt",
  },
  {
    ruleId: "cs-no-direct-convex-generated-import-outside-approved-boundaries",
    destinationPath: "packages/.opengrep-test-fixtures/direct-generated-import-positive.ts",
    templatePath: "templates/direct-generated-import-positive.ts.txt",
  },
  {
    ruleId: "cs-convex-embeddings-vector-search-must-filter-company-language",
    destinationPath: "convex/.opengrep-test-fixtures/vector-search-company-id-positive.ts",
    templatePath: "templates/vector-search-company-id-positive.ts.txt",
  },
  {
    ruleId: "cs-no-cross-workspace-relative-import",
    destinationPath: "packages/.opengrep-test-fixtures/cross-workspace-import-positive.ts",
    templatePath: "templates/cross-workspace-import-positive.ts.txt",
  },
  {
    ruleId: "cs-api-routes-no-raw-c-req-json",
    destinationPath: "apps/api/src/routes/.opengrep-test-fixtures/raw-json-positive.ts",
    templatePath: "templates/raw-json-positive.ts.txt",
  },
  {
    ruleId: "cs-api-routes-no-raw-c-req-param-service-passthrough",
    destinationPath: "apps/api/src/routes/.opengrep-test-fixtures/raw-param-positive.ts",
    templatePath: "templates/raw-param-positive.ts.txt",
  },
  {
    ruleId: "cs-apps-no-direct-convex-runtime-import",
    destinationPath: "apps/api/src/.opengrep-test-fixtures/direct-convex-runtime-positive.ts",
    templatePath: "templates/direct-convex-runtime-positive.ts.txt",
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
    destinationPath: "packages/db/src/.opengrep-test-fixtures/allowed-set-admin-auth-negative.ts",
    templatePath: "templates/allowed-set-admin-auth-negative.ts.txt",
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
  {
    ruleId: "cs-api-no-eager-r2-storage-client",
    destinationPath: "apps/api/src/services/.opengrep-test-fixtures/lazy-storage-negative.ts",
    templatePath: "templates/lazy-storage-negative.ts.txt",
  },
  {
    ruleId: "cs-no-direct-convex-generated-import-outside-approved-boundaries",
    destinationPath: "packages/convex-api/src/.opengrep-test-fixtures/allowed-generated-import-negative.ts",
    templatePath: "templates/allowed-generated-import-negative.ts.txt",
  },
  {
    ruleId: "cs-convex-embeddings-vector-search-must-filter-company-language",
    destinationPath: "convex/.opengrep-test-fixtures/vector-search-company-language-negative.ts",
    templatePath: "templates/vector-search-company-language-negative.ts.txt",
  },
  {
    ruleId: "cs-no-cross-workspace-relative-import",
    destinationPath: "packages/.opengrep-test-fixtures/alias-import-negative.ts",
    templatePath: "templates/alias-import-negative.ts.txt",
  },
  {
    ruleId: "cs-api-routes-no-raw-c-req-json",
    destinationPath: "apps/api/src/routes/.opengrep-test-fixtures/parsed-json-negative.ts",
    templatePath: "templates/parsed-json-negative.ts.txt",
  },
  {
    ruleId: "cs-api-routes-no-raw-c-req-param-service-passthrough",
    destinationPath: "apps/api/src/routes/.opengrep-test-fixtures/required-param-negative.ts",
    templatePath: "templates/required-param-negative.ts.txt",
  },
  {
    ruleId: "cs-apps-no-direct-convex-runtime-import",
    destinationPath: "apps/api/src/.opengrep-test-fixtures/db-boundary-negative.ts",
    templatePath: "templates/db-boundary-negative.ts.txt",
  },
];

const createFixture = async (destinationPath: string, templatePath: string) => {
  const fullDestinationPath = join(REPO_ROOT, destinationPath);
  const fullTemplatePath = join(TEMPLATE_ROOT, templatePath);
  cleanupRoots.add(fullDestinationPath.split(".opengrep-test-fixtures")[0] + ".opengrep-test-fixtures");

  await mkdir(dirname(fullDestinationPath), { recursive: true });
  await writeFile(fullDestinationPath, await readFile(fullTemplatePath, "utf8"));

  return destinationPath.replaceAll("\\", "/");
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

  return JSON.parse(stdout) as OpenGrepReport;
};

afterEach(async () => {
  await Promise.all(
    [...cleanupRoots].map((root) => rm(root, { recursive: true, force: true })),
  );
  cleanupRoots.clear();
});

describe("OpenGrep rule regressions", () => {
  for (const ruleCase of positiveCases) {
    opengrepTest(`${ruleCase.ruleId} matches its positive fixture`, async () => {
      const targetPath = await createFixture(ruleCase.destinationPath, ruleCase.templatePath);
      const report = await runScan(targetPath);

      expect(
        report.results.some((result) => result.check_id === ruleCase.ruleId),
      ).toBe(true);
    });
  }

  for (const ruleCase of negativeCases) {
    opengrepTest(`${ruleCase.ruleId} ignores its negative fixture`, async () => {
      const targetPath = await createFixture(ruleCase.destinationPath, ruleCase.templatePath);
      const report = await runScan(targetPath);

      expect(
        report.results.some((result) => result.check_id === ruleCase.ruleId),
      ).toBe(false);
    });
  }
});
