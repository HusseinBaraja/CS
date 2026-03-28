import { describe, expect, test } from 'bun:test';
import { resolve } from 'node:path';
import type { AuthenticationState } from './baileys';
import { createLocalAuthState } from './authState';

const createAuthenticationState = (): AuthenticationState =>
  ({}) as AuthenticationState;

describe("createLocalAuthState", () => {
  test("loads auth state from the session subdirectory", async () => {
    const calls: string[] = [];
    const state = createAuthenticationState();
    const saveCreds = async () => undefined;

    const authState = await createLocalAuthState({
      authDir: "/repo/data/bot/auth",
      sessionKey: "default",
      loadAuthState: async (sessionPath) => {
        calls.push(sessionPath);
        return { state, saveCreds };
      },
    });

    expect(calls).toEqual([resolve("/repo/data/bot/auth", "default")]);
    expect(authState).toEqual({
      state,
      saveCreds,
      sessionPath: resolve("/repo/data/bot/auth", "default"),
    });
  });

  test("rejects session keys that would escape the auth directory", async () => {
    await expect(createLocalAuthState({
      authDir: "/repo/data/bot/auth",
      sessionKey: "../outside",
      loadAuthState: async () => {
        throw new Error("loadAuthState should not be called");
      },
    })).rejects.toThrow("Invalid bot session key");
  });
});
