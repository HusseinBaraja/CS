import { describe, expect, test } from 'bun:test';
import packageJson from '../package.json';
import botPackageJson from '../apps/bot/package.json';
import webTsconfig from '../apps/web/tsconfig.json';
import webPackageJson from '../apps/web/package.json';

type PackageScripts = Record<string, string>;

const scripts = packageJson.scripts as PackageScripts;
const botScripts = botPackageJson.scripts as PackageScripts;
const webScripts = webPackageJson.scripts as PackageScripts;

describe("root package scripts", () => {
  test("exposes web app commands from the repository root", () => {
    expect(scripts["dev:web"]).toBe("turbo run dev --filter=web");
    expect(scripts["dev:bot"]).toBe("turbo run dev --filter=bot");
    expect(scripts["build:web"]).toBe("turbo run build --filter=web");
    expect(scripts["preview:web"]).toBe("bun --cwd apps/web run preview");
  });

  test("does not expose the removed static analysis wrapper", () => {
    expect(scripts.opengrep).toBeUndefined();
  });
});

describe("bot package scripts", () => {
  test("run the Baileys bot on Node while keeping the root command stable", () => {
    expect(botScripts.dev).toBe("node --watch --env-file=../../.env --import ./node_modules/tsx/dist/loader.mjs src/main.ts");
    expect(botScripts.start).toBe("node --env-file=../../.env --import ./node_modules/tsx/dist/loader.mjs src/main.ts");
    expect(botScripts["dev:bun-experimental"]).toBe("bun --env-file=../../.env --watch src/index.ts");
  });
});

describe("web package scripts", () => {
  test("use TypeScript-based checks that are available in the workspace", () => {
    expect(webScripts.typecheck).toBe("tsc --noEmit");
    expect(webScripts.lint).toBe("bun run typecheck");
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
