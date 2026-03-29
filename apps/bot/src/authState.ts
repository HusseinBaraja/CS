import { resolve } from 'node:path';
import type { AuthenticationState } from './baileys';
import { useMultiFileAuthState } from './baileys';
import { BOT_SESSION_KEY } from './runtimeConfig';
import { normalizeSessionKey } from './sessionKey';

export interface LocalAuthState {
  state: AuthenticationState;
  saveCreds: () => Promise<void>;
  sessionPath: string;
}

export interface CreateLocalAuthStateOptions {
  authDir: string;
  sessionKey?: string;
  loadAuthState?: (sessionPath: string) => Promise<{
    state: AuthenticationState;
    saveCreds: () => Promise<void>;
  }>;
}

export const createLocalAuthState = async (
  options: CreateLocalAuthStateOptions,
): Promise<LocalAuthState> => {
  const sessionKey = normalizeSessionKey(options.sessionKey ?? BOT_SESSION_KEY, "bot session key");
  const sessionPath = resolve(options.authDir, sessionKey);
  const loadAuthState = options.loadAuthState ?? useMultiFileAuthState;
  const { state, saveCreds } = await loadAuthState(sessionPath);

  return {
    state,
    saveCreds,
    sessionPath,
  };
};
