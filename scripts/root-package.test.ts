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
import corePackageJson from '../packages/core/package.json';
import storagePackageJson from '../packages/storage/package.json';

type PackageScripts = Record<string, string>;

const scripts = packageJson.scripts as PackageScripts;
const turboTasks = turboJson.tasks as Record<string, { dependsOn?: string[] }>;
const apiScripts = apiPackageJson.scripts as PackageScripts;
const botScripts = botPackageJson.scripts as PackageScripts;
const cliScripts = cliPackageJson.scripts as PackageScripts;
const workerScripts = workerPackageJson.scripts as PackageScripts;
const webScripts = webPackageJson.scripts as PackageScripts;
const convexScripts = convexPackageJson.scripts as PackageScripts;
const coreScripts = corePackageJson.scripts as PackageScripts;
const storageScripts = storagePackageJson.scripts as PackageScripts;

describe("root package scripts", () => {
  test("exposes app-runtime commands from the repository root", () => {
    expect(scripts.dev).toBe("turbo run dev --filter=api --filter=bot --filter=web --filter=worker --parallel");
    expect(scripts.web).toBe("bun run dev:web");
    expect(scripts["dev:api"]).toBe("turbo run dev --filter=api");
    expect(scripts["dev:bot"]).toBe("turbo run dev --filter=api --filter=bot --parallel");
    expect(scripts["dev:web"]).toBe("turbo run dev --filter=web");
    expect(scripts["dev:worker"]).toBe("turbo run dev --filter=worker");
    expect(scripts["build:web"]).toBe("turbo run build --filter=web");
    expect(scripts.check).toBe("turbo run check");
    expect(scripts["preview:web"]).toBe("bun --cwd apps/web run preview");
    expect(scripts.seed).toBe("bun run --cwd apps/cli seed");
    expect(scripts.backup).toBe("bun run --cwd apps/cli backup");
  });

  test("keeps cli out of the root long-running dev fanout", () => {
    expect(scripts.dev.includes("--filter=cli")).toBe(false);
    expect(scripts["dev:bot"].includes("--filter=cli")).toBe(false);
  });

  test("does not expose the removed static analysis wrapper", () => {
    expect(scripts.opengrep).toBeUndefined();
  });
});

describe("bot package scripts", () => {
  test("run the Baileys bot on Node while keeping the root command stable", () => {
    expect(botScripts.dev).toBe("node --watch --env-file=../../.env --import tsx src/main.ts");
    expect(botScripts.start).toBe("node --env-file=../../.env --import tsx src/main.ts");
    expect(botScripts["dev:bun-experimental"]).toBe("bun --env-file=../../.env --watch src/main.ts");
    expect(botScripts.build).toBe("bun --env-file=../../.env build src/main.ts --outdir dist");
    expect(botScripts.check).toBe("bun run typecheck");
    expect(botScripts.lint).toBeUndefined();
  });
});

describe("web package scripts", () => {
  test("collapse validation onto typecheck without a duplicate lint alias", () => {
    expect(webScripts.typecheck).toBe("tsc --noEmit");
    expect(webScripts.check).toBe("bun run typecheck");
    expect(webScripts.lint).toBeUndefined();
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
  test("keep non-linting workspaces on typecheck-only check scripts", () => {
    expect(apiScripts.check).toBe("bun run typecheck");
    expect(apiScripts.lint).toBeUndefined();

    expect(cliScripts.seed).toBe("bun --env-file=../../.env src/index.ts seed");
    expect(cliScripts.backup).toBe("bun --env-file=../../.env src/index.ts backup");
    expect(cliScripts.check).toBe("bun run typecheck");
    expect(cliScripts.lint).toBeUndefined();

    expect(workerScripts.check).toBe("bun run typecheck");
    expect(workerScripts.lint).toBeUndefined();

    expect(coreScripts.check).toBe("bun run typecheck");
    expect(coreScripts.lint).toBeUndefined();
  });

  test("keep real linting workspaces on lint plus typecheck", () => {
    expect(convexScripts.lint).toBe("bun x oxlint");
    expect(convexScripts.check).toBe("bun run typecheck && bun run lint");

    expect(storageScripts.lint).toBe("bun x oxlint");
    expect(storageScripts.check).toBe("bun run typecheck && bun run lint");
  });

  test("make turbo check depend on workspace check tasks only", () => {
    expect(turboTasks.check?.dependsOn).toEqual(["^check"]);
  });
});

describe("web dev server config", () => {
  test("keeps the canonical root web alias externally reachable on the existing port", () => {
    expect(webViteConfig.server?.host).toBe("0.0.0.0");
    expect(webViteConfig.server?.port).toBe(5173);
  });
});
