import { resolve } from 'node:path';
import type { AuthenticationState } from '@whiskeysockets/baileys';
import { useMultiFileAuthState } from '@whiskeysockets/baileys';
import { BOT_SESSION_KEY } from './runtimeConfig';

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
  const sessionKey = options.sessionKey ?? BOT_SESSION_KEY;
  const sessionPath = resolve(options.authDir, sessionKey);
  const loadAuthState = options.loadAuthState ?? useMultiFileAuthState;
  const { state, saveCreds } = await loadAuthState(sessionPath);

  return {
    state,
    saveCreds,
    sessionPath,
  };
};
