import { describe, expect, test } from 'bun:test';
import packageJson from '../package.json';
import webTsconfig from '../apps/web/tsconfig.json';
import webPackageJson from '../apps/web/package.json';

type PackageScripts = Record<string, string>;

const scripts = packageJson.scripts as PackageScripts;
const webScripts = webPackageJson.scripts as PackageScripts;

describe("root package scripts", () => {
  test("exposes web app commands from the repository root", () => {
    expect(scripts["dev:web"]).toBe("turbo run dev --filter=web");
    expect(scripts["build:web"]).toBe("turbo run build --filter=web");
    expect(scripts["preview:web"]).toBe("bun --cwd apps/web run preview");
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
