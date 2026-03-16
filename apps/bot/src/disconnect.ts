import { DisconnectReason } from '@whiskeysockets/baileys';

const TRANSIENT_DISCONNECT_CODES = new Set<number>([
  DisconnectReason.connectionClosed,
  DisconnectReason.connectionLost,
  DisconnectReason.timedOut,
  DisconnectReason.restartRequired,
  DisconnectReason.unavailableService,
]);

const FAILED_DISCONNECT_CODES = new Set<number>([
  DisconnectReason.badSession,
  DisconnectReason.multideviceMismatch,
  DisconnectReason.forbidden,
]);

export const getDisconnectCode = (error: unknown): number | undefined => {
  if (!error || typeof error !== "object") {
    return undefined;
  }

  const candidate = error as {
    output?: { statusCode?: unknown };
    data?: { statusCode?: unknown };
    statusCode?: unknown;
  };

  for (const statusCode of [
    candidate.output?.statusCode,
    candidate.data?.statusCode,
    candidate.statusCode,
  ]) {
    if (typeof statusCode === "number" && Number.isFinite(statusCode)) {
      return statusCode;
    }
  }

  return undefined;
};

export const shouldReconnectForDisconnectCode = (disconnectCode: number | undefined): boolean =>
  disconnectCode !== undefined && TRANSIENT_DISCONNECT_CODES.has(disconnectCode);

export const toClosedLifecycleState = (
  disconnectCode: number | undefined,
): "closed" | "failed" | "logged_out" => {
  if (disconnectCode === DisconnectReason.loggedOut) {
    return "logged_out";
  }

  if (disconnectCode !== undefined && FAILED_DISCONNECT_CODES.has(disconnectCode)) {
    return "failed";
  }

  return "closed";
};
