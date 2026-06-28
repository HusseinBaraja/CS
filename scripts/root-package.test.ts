import { describe, expect, test } from 'vitest';
import { readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
import webViteConfig from '../apps/web/vite.config';

const readJson = <T>(path: string): T =>
  JSON.parse(readFileSync(new URL(path, import.meta.url), "utf8")) as T;

const readJsonc = <T>(path: string): T => {
  const fileUrl = new URL(path, import.meta.url);
  const parsed = ts.parseConfigFileTextToJson(fileUrl.pathname, readFileSync(fileUrl, "utf8"));
  if (parsed.error) {
    throw new Error(ts.flattenDiagnosticMessageText(parsed.error.messageText, "\n"));
  }

  return parsed.config as T;
};

const packageJson = readJson<Record<string, unknown>>("../package.json");
const turboJson = readJson<Record<string, unknown>>("../turbo.json");
const apiPackageJson = readJson<Record<string, unknown>>("../apps/api/package.json");
const botPackageJson = readJson<Record<string, unknown>>("../apps/bot/package.json");
const cliPackageJson = readJson<Record<string, unknown>>("../apps/cli/package.json");
const workerPackageJson = readJson<Record<string, unknown>>("../apps/worker/package.json");
const webTsconfig = readJsonc<{ compilerOptions: { types: string[] } }>("../apps/web/tsconfig.json");
const webPackageJson = readJson<Record<string, unknown>>("../apps/web/package.json");
const convexPackageJson = readJson<Record<string, unknown>>("../convex/package.json");
const aiPackageJson = readJson<Record<string, unknown>>("../packages/ai/package.json");
const configPackageJson = readJson<Record<string, unknown>>("../packages/config/package.json");
const convexApiPackageJson = readJson<Record<string, unknown>>("../packages/convex-api/package.json");
const corePackageJson = readJson<Record<string, unknown>>("../packages/core/package.json");
const dbPackageJson = readJson<Record<string, unknown>>("../packages/db/package.json");
const ragPackageJson = readJson<Record<string, unknown>>("../packages/rag/package.json");
const sharedPackageJson = readJson<Record<string, unknown>>("../packages/shared/package.json");
const storagePackageJson = readJson<Record<string, unknown>>("../packages/storage/package.json");

type PackageScripts = Record<string, string>;

const scripts = packageJson.scripts as PackageScripts;
const turboTasks = turboJson.tasks as Record<string, { dependsOn?: string[] }>;
const turboGlobalPassThroughEnv = turboJson.globalPassThroughEnv as string[];
const apiScripts = apiPackageJson.scripts as PackageScripts;
const botScripts = botPackageJson.scripts as PackageScripts;
const cliScripts = cliPackageJson.scripts as PackageScripts;
const workerScripts = workerPackageJson.scripts as PackageScripts;
const webScripts = webPackageJson.scripts as PackageScripts;
const convexScripts = convexPackageJson.scripts as PackageScripts;
const aiScripts = aiPackageJson.scripts as PackageScripts;
const configScripts = configPackageJson.scripts as PackageScripts;
const convexApiScripts = convexApiPackageJson.scripts as PackageScripts;
const coreScripts = corePackageJson.scripts as PackageScripts;
const dbScripts = dbPackageJson.scripts as PackageScripts;
const ragScripts = ragPackageJson.scripts as PackageScripts;
const sharedScripts = sharedPackageJson.scripts as PackageScripts;
const storageScripts = storagePackageJson.scripts as PackageScripts;

const OXLINT_TWO_LEVEL_WORKSPACE =
  "oxlint --config ../../.oxlintrc.json --ignore-path ../../.oxlintignore .";
const OXLINT_ONE_LEVEL_WORKSPACE =
  "oxlint --config ../.oxlintrc.json --ignore-path ../.oxlintignore .";

describe("root package scripts", () => {
  test("exposes app-runtime commands from the repository root", () => {
    expect(scripts.dev).toBe("tsx scripts/dev-session-log.ts");
    expect(scripts.web).toBe("pnpm dev:web");
    expect(scripts["dev:api"]).toBe("tsx scripts/dev-session-log.ts --filter=api");
    expect(scripts["dev:bot"]).toBe("tsx scripts/dev-session-log.ts --filter=api --filter=bot");
    expect(scripts["dev:web"]).toBe("turbo run dev --filter=web");
    expect(scripts["dev:worker"]).toBe("tsx scripts/dev-session-log.ts --filter=worker");
    expect(scripts["build:web"]).toBe("turbo run build --filter=web");
    expect(scripts["check:root"]).toBe("pnpm test:root");
    expect(scripts["lint:root"]).toBe(
      "oxlint --config .oxlintrc.json --ignore-path .oxlintignore scripts",
    );
    expect(scripts.lint).toBe("pnpm lint:root && turbo run lint");
    expect(scripts.check).toBe("pnpm check:root && turbo run check");
    expect(scripts["preview:web"]).toBe("pnpm --dir apps/web preview");
    expect(scripts.seed).toBe("pnpm --dir apps/cli seed");
    expect(scripts.backup).toBe("pnpm --dir apps/cli backup");
    expect(scripts["issue:diagram"]).toBe("tsx scripts/generate-agent-mermaid.ts");
    expect(scripts.ci).toBe("pnpm check:root && turbo run ci");
  });

  test("keeps cli out of the root long-running dev fanout", () => {
    expect(scripts.dev.includes("--filter=cli")).toBe(false);
    expect(scripts["dev:bot"].includes("--filter=cli")).toBe(false);
  });

  test("does not expose the removed static analysis wrapper", () => {
    expect(scripts.opengrep).toBeUndefined();
  });

  test("keeps lint as fast static analysis only", () => {
    expect(scripts.lint).toContain("turbo run lint");
    expect(scripts.lint).not.toContain("typecheck");
    expect(scripts.lint).not.toContain("test");
    expect(scripts.lint).not.toContain("generate");
  });

  test("keeps check as the broader validation gate", () => {
    expect(scripts.check).toContain("check:root");
    expect(scripts.check).toContain("turbo run check");
  });
});

describe("bot package scripts", () => {
  test("run the Baileys bot on Node while keeping the root command stable", () => {
    expect(botScripts.dev).toBe("node --watch --env-file-if-exists=../../.env --import tsx src/main.ts");
    expect(botScripts.start).toBe("node --env-file-if-exists=../../.env --import tsx src/main.ts");
    expect(botScripts.build).toBe("tsup src/main.ts --out-dir dist --format esm --target node22");
    expect(botScripts.lint).toBe(OXLINT_TWO_LEVEL_WORKSPACE);
    expect(botScripts.check).toBe("pnpm typecheck && pnpm lint");
  });
});

describe("web package scripts", () => {
  test("run oxlint plus a web-only eslint layer", () => {
    expect(webScripts.typecheck).toBe("tsc --noEmit");
    expect(webScripts["lint:ox"]).toBe(OXLINT_TWO_LEVEL_WORKSPACE);
    expect(webScripts["lint:eslint"]).toBe("eslint . --max-warnings=0");
    expect(webScripts.lint).toBe("pnpm lint:ox && pnpm lint:eslint");
    expect(webScripts.check).toBe("pnpm typecheck && pnpm lint");
  });
});

describe("web TypeScript config", () => {
  test("limits ambient types to the browser React toolchain", () => {
    expect(webTsconfig.compilerOptions.types).toEqual([
      "react",
      "react-dom",
      "vite/client",
    ]);
  });
});

describe("command validation conventions", () => {
  test("validate the PowerShell watcher entry path before resolving it", async () => {
    const script = await readFile(new URL("../scripts/watch-from-root.ps1", import.meta.url), "utf8");
    const testPathIndex = script.indexOf("Test-Path $EntryPath");
    const resolvePathIndex = script.indexOf("(Resolve-Path $EntryPath).Path");

    expect(testPathIndex).toBeGreaterThanOrEqual(0);
    expect(resolvePathIndex).toBeGreaterThanOrEqual(0);
    expect(testPathIndex).toBeLessThan(resolvePathIndex);
  });

  test("enforce lint script coverage and broad check scripts across workspaces", () => {
    expect(apiScripts.dev).toBe("tsx ../../scripts/watch-from-root.ts src/index.ts");
    expect(apiScripts.lint).toBe(OXLINT_TWO_LEVEL_WORKSPACE);
    expect(apiScripts.check).toBe("pnpm typecheck && pnpm lint");

    expect(cliScripts.seed).toBe("node --env-file-if-exists=../../.env --import tsx src/index.ts seed");
    expect(cliScripts.backup).toBe("node --env-file-if-exists=../../.env --import tsx src/index.ts backup");
    expect(cliScripts.lint).toBe(OXLINT_TWO_LEVEL_WORKSPACE);
    expect(cliScripts.check).toBe("pnpm typecheck && pnpm lint");

    expect(workerScripts.dev).toBe("tsx ../../scripts/watch-from-root.ts src/index.ts");
    expect(workerScripts.lint).toBe(OXLINT_TWO_LEVEL_WORKSPACE);
    expect(workerScripts.check).toBe("pnpm typecheck && pnpm lint");

    expect(aiScripts.dev).toBe("tsx ../../scripts/watch-from-root.ts src/index.ts");
    expect(aiScripts.lint).toBe(OXLINT_TWO_LEVEL_WORKSPACE);
    expect(aiScripts.check).toBe("pnpm typecheck && pnpm lint");

    expect(configScripts.dev).toBe("tsx ../../scripts/watch-from-root.ts src/index.ts");
    expect(configScripts.lint).toBe(OXLINT_TWO_LEVEL_WORKSPACE);
    expect(configScripts.check).toBe("pnpm typecheck && pnpm lint");

    expect(convexApiScripts.dev).toBe("tsx ../../scripts/watch-from-root.ts src/index.ts");
    expect(convexApiScripts.lint).toBe(OXLINT_TWO_LEVEL_WORKSPACE);
    expect(convexApiScripts.check).toBe("pnpm typecheck && pnpm lint");

    expect(coreScripts.dev).toBe("tsx ../../scripts/watch-from-root.ts src/index.ts");
    expect(coreScripts.lint).toBe(OXLINT_TWO_LEVEL_WORKSPACE);
    expect(coreScripts.check).toBe("pnpm typecheck && pnpm lint");

    expect(dbScripts.dev).toBe("tsx ../../scripts/watch-from-root.ts src/index.ts");
    expect(dbScripts.lint).toBe(OXLINT_TWO_LEVEL_WORKSPACE);
    expect(dbScripts.check).toBe("pnpm typecheck && pnpm lint");

    expect(ragScripts.dev).toBe("tsx ../../scripts/watch-from-root.ts src/index.ts");
    expect(ragScripts.lint).toBe(OXLINT_TWO_LEVEL_WORKSPACE);
    expect(ragScripts.check).toBe("pnpm typecheck && pnpm lint");

    expect(sharedScripts.dev).toBe("tsx ../../scripts/watch-from-root.ts src/index.ts");
    expect(sharedScripts.lint).toBe(OXLINT_TWO_LEVEL_WORKSPACE);
    expect(sharedScripts.check).toBe("pnpm typecheck && pnpm lint");

    expect(convexScripts.lint).toBe(OXLINT_ONE_LEVEL_WORKSPACE);
    expect(convexScripts.check).toBe("pnpm typecheck && pnpm lint");

    expect(storageScripts.lint).toBe(OXLINT_TWO_LEVEL_WORKSPACE);
    expect(storageScripts.check).toBe("pnpm typecheck && pnpm lint");
  });

  test("generates a shared markdown conversation session file for root bot and worker dev runs", () => {
    expect(scripts.dev).toContain("dev-session-log.ts");
    expect(scripts["dev:bot"]).toContain("dev-session-log.ts");
    expect(scripts["dev:worker"]).toContain("dev-session-log.ts");
  });

  test("make turbo check depend on workspace check tasks only", () => {
    expect(turboTasks.check?.dependsOn).toEqual(["^check"]);
  });

  test("make turbo lint depend on workspace lint tasks only", () => {
    expect(turboTasks.lint?.dependsOn).toEqual(["^lint"]);
  });

  test("passes conversation session log env vars through turbo dev tasks", () => {
    expect(turboGlobalPassThroughEnv).toEqual(expect.arrayContaining([
      "CONVERSATION_LOG_SESSION_ID",
      "CONVERSATION_LOG_SESSION_PATH",
    ]));
  });
});

describe("web dev server config", () => {
  test("keeps the canonical root web alias externally reachable on the existing port", () => {
    expect(webViteConfig.server?.host).toBe("0.0.0.0");
    expect(webViteConfig.server?.port).toBe(5173);
  });
});
