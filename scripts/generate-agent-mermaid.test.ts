import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import {
  AGENT_ISSUES_DIRECTORY,
  AGENT_ISSUES_IMAGE_DIRECTORY,
  AgentMermaidArgumentError,
  buildMermaidCliCommand,
  buildMermaidCliEnv,
  parseCliArgs,
  resolveIssueMermaidPath,
  resolveIssuePngPath,
  resolvePuppeteerExecutablePath,
} from './generate-agent-mermaid';

let tempDirectory = "";

beforeEach(() => {
  tempDirectory = mkdtempSync(join(tmpdir(), "cs-agent-mermaid-"));
  mkdirSync(resolve(tempDirectory, AGENT_ISSUES_DIRECTORY), { recursive: true });
});

afterEach(() => {
  rmSync(tempDirectory, { force: true, recursive: true });
});

describe("parseCliArgs", () => {
  test("parses the issue file and optional output name", () => {
    expect(parseCliArgs(["agent-issues/timeout-flow.mmd", "timeout-flow"])).toEqual({
      inputFile: "agent-issues/timeout-flow.mmd",
      outputName: "timeout-flow",
    });
  });

  test("throws on missing input file", () => {
    expect(() => parseCliArgs([])).toThrow(
      new AgentMermaidArgumentError(
        "Expected usage: bun run issue:diagram -- <agent-issues/*.mmd> [output-name]",
      ),
    );
  });

  test("throws when too many arguments are provided", () => {
    expect(() => parseCliArgs(["a.mmd", "b", "c"])).toThrow(
      new AgentMermaidArgumentError(
        "Expected usage: bun run issue:diagram -- <agent-issues/*.mmd> [output-name]",
      ),
    );
  });
});

describe("resolveIssueMermaidPath", () => {
  test("resolves a Mermaid file inside the designated agent issues folder", () => {
    const issuePath = resolve(tempDirectory, AGENT_ISSUES_DIRECTORY, "sync-warning.mmd");
    writeFileSync(issuePath, "graph TD; A-->B;");

    expect(resolveIssueMermaidPath("agent-issues/sync-warning.mmd", tempDirectory)).toBe(issuePath);
  });

  test("rejects Mermaid files outside the designated folder", () => {
    const issuePath = resolve(tempDirectory, "sync-warning.mmd");
    writeFileSync(issuePath, "graph TD; A-->B;");

    expect(() => resolveIssueMermaidPath("sync-warning.mmd", tempDirectory)).toThrow(
      new AgentMermaidArgumentError(
        `Input file must be inside "${AGENT_ISSUES_DIRECTORY}" directory.`,
      ),
    );
  });

  test("requires an .mmd extension", () => {
    const issuePath = resolve(tempDirectory, AGENT_ISSUES_DIRECTORY, "sync-warning.txt");
    writeFileSync(issuePath, "graph TD; A-->B;");

    expect(() => resolveIssueMermaidPath("agent-issues/sync-warning.txt", tempDirectory)).toThrow(
      new AgentMermaidArgumentError("Input file must use the .mmd extension."),
    );
  });
});

describe("resolveIssuePngPath", () => {
  test("defaults to IMG/<mermaid-file-name>.png", () => {
    const mermaidFile = resolve(tempDirectory, AGENT_ISSUES_DIRECTORY, "handoff-retry.mmd");

    expect(resolveIssuePngPath(mermaidFile, undefined, tempDirectory)).toBe(
      resolve(
        tempDirectory,
        AGENT_ISSUES_DIRECTORY,
        AGENT_ISSUES_IMAGE_DIRECTORY,
        "handoff-retry.png",
      ),
    );
  });

  test("normalizes an output name by appending .png", () => {
    const mermaidFile = resolve(tempDirectory, AGENT_ISSUES_DIRECTORY, "handoff-retry.mmd");

    expect(resolveIssuePngPath(mermaidFile, "retry-v2", tempDirectory)).toBe(
      resolve(
        tempDirectory,
        AGENT_ISSUES_DIRECTORY,
        AGENT_ISSUES_IMAGE_DIRECTORY,
        "retry-v2.png",
      ),
    );
  });
});

describe("resolvePuppeteerExecutablePath", () => {
  test("returns the configured environment executable path first", () => {
    expect(
      resolvePuppeteerExecutablePath(
        { PUPPETEER_EXECUTABLE_PATH: "C:\\custom\\chrome.exe" },
        () => false,
      ),
    ).toBe("C:\\custom\\chrome.exe");
  });

  test("detects the first existing bundled browser path when env is unset", () => {
    expect(
      resolvePuppeteerExecutablePath(
        {},
        (path) => path === "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
      ),
    ).toBe("C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe");
  });

  test("returns undefined when no browser path is available", () => {
    expect(resolvePuppeteerExecutablePath({}, () => false)).toBeUndefined();
  });
});

describe("buildMermaidCliEnv", () => {
  test("enables skipping browser downloads and sets a discovered executable path", () => {
    expect(
      buildMermaidCliEnv(
        {},
        "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
      ),
    ).toEqual(
      expect.objectContaining({
        PUPPETEER_SKIP_DOWNLOAD: "true",
        PUPPETEER_EXECUTABLE_PATH: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
      }),
    );
  });

  test("preserves explicit caller environment values", () => {
    expect(
      buildMermaidCliEnv(
        {
          PUPPETEER_SKIP_DOWNLOAD: "false",
          PUPPETEER_EXECUTABLE_PATH: "C:\\existing\\chrome.exe",
        },
        "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
      ),
    ).toEqual(
      expect.objectContaining({
        PUPPETEER_SKIP_DOWNLOAD: "false",
        PUPPETEER_EXECUTABLE_PATH: "C:\\existing\\chrome.exe",
      }),
    );
  });
});

describe("buildMermaidCliCommand", () => {
  test("uses high-resolution render defaults for readable PNG output", () => {
    expect(
      buildMermaidCliCommand(
        "C:\\repo\\agent-issues\\flow.mmd",
        "C:\\repo\\agent-issues\\IMG\\flow.png",
      ),
    ).toEqual([
      process.execPath,
      "x",
      "@mermaid-js/mermaid-cli",
      "--input",
      "C:\\repo\\agent-issues\\flow.mmd",
      "--output",
      "C:\\repo\\agent-issues\\IMG\\flow.png",
      "--backgroundColor",
      "white",
      "--width",
      "2400",
      "--scale",
      "2",
    ]);
  });
});
