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

export const BOT_RUNTIME_PAIRING_STATES = [
  "none",
  "ready",
  "expired",
] as const;

export type BotRuntimePairingState = (typeof BOT_RUNTIME_PAIRING_STATES)[number];

export const BOT_RUNTIME_OPERATOR_STATES = [
  "healthy",
  "connecting",
  "awaiting_pairing",
  "reconnecting",
  "closed",
  "logged_out",
  "failed",
  "stale",
] as const;

export type BotRuntimeOperatorState = (typeof BOT_RUNTIME_OPERATOR_STATES)[number];

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

export interface BotRuntimePairingArtifact {
  companyId: string;
  runtimeOwnerId: string;
  sessionKey: string;
  qrText: string;
  updatedAt: number;
  expiresAt: number;
}

export interface BotRuntimeOperatorSnapshot extends CompanyRuntimeProfile {
  session: BotRuntimeSessionRecord | null;
  pairing: {
    state: BotRuntimePairingState;
    updatedAt?: number;
    expiresAt?: number;
    qrText?: string;
  };
}

export interface BotRuntimeOperatorSummary {
  code:
    | "healthy"
    | "connecting"
    | "qr_ready"
    | "qr_expired"
    | "qr_waiting"
    | "reconnecting"
    | "logged_out"
    | "closed"
    | "failed"
    | "stale";
  text: string;
}

export interface BotRuntimeReconnectBackoff {
  initialDelayMs: number;
  maxDelayMs: number;
}

export const DEFAULT_BOT_RUNTIME_RECONNECT_BACKOFF: BotRuntimeReconnectBackoff = {
  initialDelayMs: 1_000,
  maxDelayMs: 30_000,
};

const hasLiveSessionLease = (
  session: BotRuntimeSessionRecord | null,
  now: number,
): session is BotRuntimeSessionRecord =>
  session !== null && session.leaseExpiresAt >= now;

export const getBotRuntimeOperatorState = (
  snapshot: BotRuntimeOperatorSnapshot,
  now: number,
): BotRuntimeOperatorState => {
  if (!hasLiveSessionLease(snapshot.session, now)) {
    return "stale";
  }

  switch (snapshot.session.state) {
    case "open":
      return "healthy";
    case "initializing":
    case "connecting":
      return "connecting";
    case "awaiting_pairing":
      return "awaiting_pairing";
    case "reconnecting":
      return "reconnecting";
    case "closed":
      return "closed";
    case "logged_out":
      return "logged_out";
    case "failed":
      return "failed";
  }
};

export const getBotRuntimeReconnectDelayMs = (
  attempt: number,
  reconnectBackoff: BotRuntimeReconnectBackoff = DEFAULT_BOT_RUNTIME_RECONNECT_BACKOFF,
): number =>
  Math.min(
    reconnectBackoff.initialDelayMs * 2 ** Math.max(0, attempt - 1),
    reconnectBackoff.maxDelayMs,
  );

export const getBotRuntimeOperatorSummary = (
  snapshot: BotRuntimeOperatorSnapshot,
  now: number,
): BotRuntimeOperatorSummary => {
  if (snapshot.session === null) {
    return {
      code: "stale",
      text: "No active bot runtime session was found for this tenant.",
    };
  }

  if (snapshot.session.leaseExpiresAt < now) {
    return {
      code: "stale",
      text: "Bot runtime heartbeat is stale for this tenant.",
    };
  }

  switch (snapshot.session.state) {
    case "open":
      return {
        code: "healthy",
        text: "Bot session is connected and healthy.",
      };
    case "initializing":
    case "connecting":
      return {
        code: "connecting",
        text: "Bot session is connecting to WhatsApp.",
      };
    case "awaiting_pairing":
      if (snapshot.pairing.state === "ready") {
        return {
          code: "qr_ready",
          text: "A QR code is ready to be scanned for pairing.",
        };
      }

      if (snapshot.pairing.state === "expired") {
        return {
          code: "qr_expired",
          text: "The last QR code expired and the runtime is waiting for a fresh one.",
        };
      }

      return {
        code: "qr_waiting",
        text: "Bot session is waiting for a fresh QR code.",
      };
    case "reconnecting":
      return {
        code: "reconnecting",
        text: "Bot session is reconnecting after a transient disconnect.",
      };
    case "logged_out":
      return {
        code: "logged_out",
        text: "Bot session was logged out and must be paired again.",
      };
    case "closed":
      return {
        code: "closed",
        text: "Bot session closed without an active reconnect loop.",
      };
    case "failed":
      return {
        code: "failed",
        text: "Bot session failed and needs operator attention.",
      };
  }
};

export const isBotRuntimeOperatorHealthy = (
  snapshot: BotRuntimeOperatorSnapshot,
  now: number,
): boolean =>
  getBotRuntimeOperatorState(snapshot, now) === "healthy";

export const getBotRuntimeNextActionHint = (
  snapshot: BotRuntimeOperatorSnapshot,
  now: number,
): string | undefined => {
  if (snapshot.session === null || snapshot.session.leaseExpiresAt < now) {
    return "Restart the bot runtime and confirm the tenant session heartbeat resumes.";
  }

  switch (snapshot.session.state) {
    case "open":
      return undefined;
    case "initializing":
    case "connecting":
      return "Wait for the WhatsApp connection to finish opening.";
    case "awaiting_pairing":
      if (snapshot.pairing.state === "ready") {
        return "Open the pairing page and scan the QR code with the tenant WhatsApp account.";
      }

      if (snapshot.pairing.state === "expired") {
        return "Wait for the runtime to refresh the QR code, then scan the new code.";
      }

      return "Keep the runtime running until a fresh QR code becomes available.";
    case "reconnecting":
      return "Wait for the reconnect backoff window to elapse or inspect the disconnect code.";
    case "logged_out":
      return "Start a new pairing flow for this tenant.";
    case "closed":
    case "failed":
      return "Inspect the runtime logs and restart or re-pair the tenant session as needed.";
  }
};

export const createCompanySessionKey = (companyId: string): string =>
  `company-${Buffer.from(companyId).toString("base64url")}`;
