import { describe, expect, test } from 'bun:test';
import { join, resolve } from 'node:path';
import { BOT_SESSION_KEY, createBotRuntimeConfig, getBotRepoRoot } from './runtimeConfig';

describe("createBotRuntimeConfig", () => {
  test("resolves the default auth dir from the repo root", () => {
    const moduleDirectory = process.platform === "win32"
      ? join("C:", "repo", "apps", "bot", "src")
      : "/repo/apps/bot/src";

    const config = createBotRuntimeConfig({ moduleDirectory });

    expect(config.sessionKey).toBe(BOT_SESSION_KEY);
    expect(config.authDir).toBe(resolve(moduleDirectory, "..", "..", "..", "data", "bot", "auth"));
    expect(config.browser[0]).toBe("Windows");
    expect(config.browser[1]).toBe("CSCB Bot");
    expect(typeof config.browser[2]).toBe("string");
    expect(config.browser[2].length).toBeGreaterThan(0);
    expect(config.markOnlineOnConnect).toBe(false);
    expect(config.syncFullHistory).toBe(false);
  });

  test("preserves absolute auth dirs", () => {
    const absoluteAuthDir = process.platform === "win32" ? "C:\\bot-auth" : "/tmp/bot-auth";

    const config = createBotRuntimeConfig({
      authDir: absoluteAuthDir,
      moduleDirectory: "/repo/apps/bot/src",
    });

    expect(config.authDir).toBe(absoluteAuthDir);
  });

  test("allows overriding the session key", () => {
    const config = createBotRuntimeConfig({
      moduleDirectory: "/repo/apps/bot/src",
      sessionKey: "company-Y29tcGFueS0x",
    });

    expect(config.sessionKey).toBe("company-Y29tcGFueS0x");
  });

  test("fails early for invalid timing overrides", () => {
    expect(() =>
      createBotRuntimeConfig({
        connectTimeoutMs: 0,
        moduleDirectory: "/repo/apps/bot/src",
      })
    ).toThrow("Invalid BotRuntimeConfig.connectTimeoutMs");

    expect(() =>
      createBotRuntimeConfig({
        reconnectInitialDelayMs: 5_000,
        reconnectMaxDelayMs: 4_000,
        moduleDirectory: "/repo/apps/bot/src",
      })
    ).toThrow("BotRuntimeConfig.reconnectBackoff.maxDelayMs");
  });
});

describe("getBotRepoRoot", () => {
  test("derives the repo root from the bot source or dist directory", () => {
    const repoRoot = process.platform === "win32" ? "C:\\repo" : "/repo";
    const srcDirectory = process.platform === "win32" ? "C:\\repo\\apps\\bot\\src" : "/repo/apps/bot/src";
    const distDirectory = process.platform === "win32" ? "C:\\repo\\apps\\bot\\dist" : "/repo/apps/bot/dist";

    expect(getBotRepoRoot(srcDirectory)).toBe(repoRoot);
    expect(getBotRepoRoot(distDirectory)).toBe(repoRoot);
  });
});
