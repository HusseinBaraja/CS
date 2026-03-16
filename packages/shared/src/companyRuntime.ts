export const DEFAULT_COMPANY_TIMEZONE = "UTC" as const;

export type CompanyRuntimeConfig = Record<string, string | number | boolean>;

export const BOT_RUNTIME_SESSION_STATES = [
  "initializing",
  "connecting",
  "awaiting_pairing",
  "open",
  "reconnecting",
  "closed",
  "logged_out",
  "failed",
] as const;

export type BotRuntimeSessionState = (typeof BOT_RUNTIME_SESSION_STATES)[number];

export interface CompanyRuntimeProfile {
  companyId: string;
  name: string;
  ownerPhone: string;
  timezone: string;
  config?: CompanyRuntimeConfig;
  sessionKey: string;
}

export interface BotRuntimeSessionRecord {
  companyId: string;
  runtimeOwnerId: string;
  sessionKey: string;
  state: BotRuntimeSessionState;
  attempt: number;
  hasQr: boolean;
  disconnectCode?: number;
  isNewLogin?: boolean;
  updatedAt: number;
  leaseExpiresAt: number;
}

export const createCompanySessionKey = (companyId: string): string =>
  `company-${Buffer.from(companyId).toString("base64url")}`;
