export type AuthenticationState = any;
export type UserFacingSocketConfig = any;
export type WAMessage = any;

export type BaileysEventMap = {
  "messages.upsert": {
    type: "append" | "notify";
    messages: WAMessage[];
  };
};

export const DisconnectReason: Record<string, number>;
export const Browsers: {
  macOS(name: string): [string, string, string];
};

export function fetchLatestWaWebVersion(): Promise<{
  version: [number, number, number];
}>;
export function getContentType(message: unknown): string | undefined;
export function isJidBroadcast(jid: string): boolean;
export function isJidGroup(jid: string): boolean;
export function isJidNewsletter(jid: string): boolean;
export function isJidStatusBroadcast(jid: string): boolean;
export function jidDecode(jid: string): { user?: string } | undefined;
export function jidNormalizedUser(jid: string): string;
export function normalizeMessageContent(message: unknown): any;
export function useMultiFileAuthState(authDir: string): Promise<{
  state: AuthenticationState;
  saveCreds: () => Promise<void>;
}>;

declare const makeWASocket: (config: UserFacingSocketConfig) => any;
export default makeWASocket;
