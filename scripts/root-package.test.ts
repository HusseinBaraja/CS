import { describe, expect, test } from 'bun:test';
import packageJson from '../package.json';
import turboJson from '../turbo.json';
import apiPackageJson from '../apps/api/package.json';
import botPackageJson from '../apps/bot/package.json';
import cliPackageJson from '../apps/cli/package.json';
import workerPackageJson from '../apps/worker/package.json';
import webViteConfig from '../apps/web/vite.config';
import webTsconfig from '../apps/web/tsconfig.json';
import webPackageJson from '../apps/web/package.json';
import convexPackageJson from '../convex/package.json';
import aiPackageJson from '../packages/ai/package.json';
import configPackageJson from '../packages/config/package.json';
import convexApiPackageJson from '../packages/convex-api/package.json';
import corePackageJson from '../packages/core/package.json';
import dbPackageJson from '../packages/db/package.json';
import ragPackageJson from '../packages/rag/package.json';
import sharedPackageJson from '../packages/shared/package.json';
import storagePackageJson from '../packages/storage/package.json';

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
    expect(scripts.dev).toBe("bun scripts/dev-session-log.ts");
    expect(scripts.web).toBe("bun run dev:web");
    expect(scripts["dev:api"]).toBe("bun scripts/dev-session-log.ts --filter=api");
    expect(scripts["dev:bot"]).toBe("bun scripts/dev-session-log.ts --filter=api --filter=bot");
    expect(scripts["dev:web"]).toBe("turbo run dev --filter=web");
    expect(scripts["dev:worker"]).toBe("bun scripts/dev-session-log.ts --filter=worker");
    expect(scripts["build:web"]).toBe("turbo run build --filter=web");
    expect(scripts["check:root"]).toBe("bun run test:root");
    expect(scripts["lint:root"]).toBe(
      "oxlint --config .oxlintrc.json --ignore-path .oxlintignore scripts",
    );
    expect(scripts.lint).toBe("bun run lint:root && turbo run lint");
    expect(scripts.check).toBe("bun run check:root && turbo run check");
    expect(scripts["preview:web"]).toBe("bun --cwd apps/web run preview");
    expect(scripts.seed).toBe("bun run --cwd apps/cli seed");
    expect(scripts.backup).toBe("bun run --cwd apps/cli backup");
    expect(scripts["issue:diagram"]).toBe("bun scripts/generate-agent-mermaid.ts");
    expect(scripts.ci).toBe("bun run check:root && turbo run ci");
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
    expect(botScripts["dev:bun-experimental"]).toBe("bun --env-file=../../.env --watch src/main.ts");
    expect(botScripts.build).toBe("bun --env-file=../../.env build src/main.ts --outdir dist --target node");
    expect(botScripts.lint).toBe(OXLINT_TWO_LEVEL_WORKSPACE);
    expect(botScripts.check).toBe("bun run typecheck && bun run lint");
  });
});

describe("web package scripts", () => {
  test("run oxlint plus a web-only eslint layer", () => {
    expect(webScripts.typecheck).toBe("tsc --noEmit");
    expect(webScripts["lint:ox"]).toBe(OXLINT_TWO_LEVEL_WORKSPACE);
    expect(webScripts["lint:eslint"]).toBe("eslint . --max-warnings=0");
    expect(webScripts.lint).toBe("bun run lint:ox && bun run lint:eslint");
    expect(webScripts.check).toBe("bun run typecheck && bun run lint");
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
    const script = await Bun.file(new URL("../scripts/watch-from-root.ps1", import.meta.url)).text();
    const testPathIndex = script.indexOf("Test-Path $EntryPath");
    const resolvePathIndex = script.indexOf("(Resolve-Path $EntryPath).Path");

    expect(testPathIndex).toBeGreaterThanOrEqual(0);
    expect(resolvePathIndex).toBeGreaterThanOrEqual(0);
    expect(testPathIndex).toBeLessThan(resolvePathIndex);
  });

  test("enforce lint script coverage and broad check scripts across workspaces", () => {
    expect(apiScripts.dev).toBe("bun ../../scripts/watch-from-root.ts src/index.ts");
    expect(apiScripts.lint).toBe(OXLINT_TWO_LEVEL_WORKSPACE);
    expect(apiScripts.check).toBe("bun run typecheck && bun run lint");

    expect(cliScripts.seed).toBe("bun --env-file=../../.env src/index.ts seed");
    expect(cliScripts.backup).toBe("bun --env-file=../../.env src/index.ts backup");
    expect(cliScripts.lint).toBe(OXLINT_TWO_LEVEL_WORKSPACE);
    expect(cliScripts.check).toBe("bun run typecheck && bun run lint");

    expect(workerScripts.dev).toBe("bun ../../scripts/watch-from-root.ts src/index.ts");
    expect(workerScripts.lint).toBe(OXLINT_TWO_LEVEL_WORKSPACE);
    expect(workerScripts.check).toBe("bun run typecheck && bun run lint");

    expect(aiScripts.dev).toBe("bun ../../scripts/watch-from-root.ts src/index.ts");
    expect(aiScripts.lint).toBe(OXLINT_TWO_LEVEL_WORKSPACE);
    expect(aiScripts.check).toBe("bun run typecheck && bun run lint");

    expect(configScripts.dev).toBe("bun ../../scripts/watch-from-root.ts src/index.ts");
    expect(configScripts.lint).toBe(OXLINT_TWO_LEVEL_WORKSPACE);
    expect(configScripts.check).toBe("bun run typecheck && bun run lint");

    expect(convexApiScripts.dev).toBe("bun ../../scripts/watch-from-root.ts src/index.ts");
    expect(convexApiScripts.lint).toBe(OXLINT_TWO_LEVEL_WORKSPACE);
    expect(convexApiScripts.check).toBe("bun run typecheck && bun run lint");

    expect(coreScripts.dev).toBe("bun ../../scripts/watch-from-root.ts src/index.ts");
    expect(coreScripts.lint).toBe(OXLINT_TWO_LEVEL_WORKSPACE);
    expect(coreScripts.check).toBe("bun run typecheck && bun run lint");

    expect(dbScripts.dev).toBe("bun ../../scripts/watch-from-root.ts src/index.ts");
    expect(dbScripts.lint).toBe(OXLINT_TWO_LEVEL_WORKSPACE);
    expect(dbScripts.check).toBe("bun run typecheck && bun run lint");

    expect(ragScripts.dev).toBe("bun ../../scripts/watch-from-root.ts src/index.ts");
    expect(ragScripts.lint).toBe(OXLINT_TWO_LEVEL_WORKSPACE);
    expect(ragScripts.check).toBe("bun run typecheck && bun run lint");

    expect(sharedScripts.dev).toBe("bun ../../scripts/watch-from-root.ts src/index.ts");
    expect(sharedScripts.lint).toBe(OXLINT_TWO_LEVEL_WORKSPACE);
    expect(sharedScripts.check).toBe("bun run typecheck && bun run lint");

    expect(convexScripts.lint).toBe(OXLINT_ONE_LEVEL_WORKSPACE);
    expect(convexScripts.check).toBe("bun run typecheck && bun run lint");

    expect(storageScripts.lint).toBe(OXLINT_TWO_LEVEL_WORKSPACE);
    expect(storageScripts.check).toBe("bun run typecheck && bun run lint");
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
