import { describe, expect, test } from 'bun:test';
import {
  getBotRuntimeNextActionHint,
  getBotRuntimeOperatorState,
  getBotRuntimeOperatorSummary,
  isBotRuntimeOperatorHealthy,
  type BotRuntimeOperatorSnapshot,
} from './companyRuntime';

const createSnapshot = (
  overrides: Partial<BotRuntimeOperatorSnapshot> = {},
): BotRuntimeOperatorSnapshot => ({
  companyId: "company-1",
  name: "Alpha Packaging",
  ownerPhone: "966500000001",
  timezone: "UTC",
  sessionKey: "company-Y29tcGFueS0x",
  session: {
    companyId: "company-1",
    runtimeOwnerId: "runtime-owner-1",
    sessionKey: "company-Y29tcGFueS0x",
    state: "open",
    attempt: 0,
    hasQr: false,
    updatedAt: 1_000,
    leaseExpiresAt: 61_000,
  },
  pairing: null,
  ...overrides,
});

describe("companyRuntime operator helpers", () => {
  test("treats open sessions with a live lease as healthy", () => {
    const snapshot = createSnapshot();

    expect(getBotRuntimeOperatorState(snapshot, 10_000)).toBe("healthy");
    expect(getBotRuntimeOperatorSummary(snapshot, 10_000)).toEqual({
      code: "healthy",
      text: "Bot session is connected and healthy.",
    });
    expect(isBotRuntimeOperatorHealthy(snapshot, 10_000)).toBe(true);
    expect(getBotRuntimeNextActionHint(snapshot, 10_000)).toBeUndefined();
  });

  test("treats expired leases as stale even when the last stored state was open", () => {
    const snapshot = createSnapshot({
      session: {
        companyId: "company-1",
        runtimeOwnerId: "runtime-owner-1",
        sessionKey: "company-Y29tcGFueS0x",
        state: "open",
        attempt: 0,
        hasQr: false,
        updatedAt: 1_000,
        leaseExpiresAt: 2_000,
      },
    });

    expect(getBotRuntimeOperatorState(snapshot, 2_001)).toBe("stale");
    expect(getBotRuntimeOperatorSummary(snapshot, 2_001).code).toBe("stale");
    expect(isBotRuntimeOperatorHealthy(snapshot, 2_001)).toBe(false);
  });

  test("distinguishes ready and expired pairing states while the session awaits pairing", () => {
    const readySnapshot = createSnapshot({
      session: {
        companyId: "company-1",
        runtimeOwnerId: "runtime-owner-1",
        sessionKey: "company-Y29tcGFueS0x",
        state: "awaiting_pairing",
        attempt: 0,
        hasQr: true,
        updatedAt: 1_000,
        leaseExpiresAt: 61_000,
      },
      pairing: {
        updatedAt: 1_000,
        expiresAt: 61_000,
        qrText: "qr-ready",
      },
    });
    const expiredSnapshot = createSnapshot({
      session: {
        companyId: "company-1",
        runtimeOwnerId: "runtime-owner-1",
        sessionKey: "company-Y29tcGFueS0x",
        state: "awaiting_pairing",
        attempt: 0,
        hasQr: false,
        updatedAt: 1_000,
        leaseExpiresAt: 61_000,
      },
      pairing: {
        updatedAt: 62_000,
        expiresAt: 9_000,
      },
    });

    expect(getBotRuntimeOperatorState(readySnapshot, 10_000)).toBe("awaiting_pairing");
    expect(getBotRuntimeOperatorSummary(readySnapshot, 10_000).code).toBe("qr_ready");
    expect(getBotRuntimeNextActionHint(readySnapshot, 10_000)).toContain("scan the QR code");

    expect(getBotRuntimeOperatorState(expiredSnapshot, 10_000)).toBe("awaiting_pairing");
    expect(getBotRuntimeOperatorSummary(expiredSnapshot, 10_000).code).toBe("qr_expired");
    expect(getBotRuntimeNextActionHint(expiredSnapshot, 10_000)).toContain("refresh the QR code");
  });

  test("treats closed sessions as a distinct operator state", () => {
    const snapshot = createSnapshot({
      session: {
        companyId: "company-1",
        runtimeOwnerId: "runtime-owner-1",
        sessionKey: "company-Y29tcGFueS0x",
        state: "closed",
        attempt: 0,
        hasQr: false,
        updatedAt: 1_000,
        leaseExpiresAt: 61_000,
      },
    });

    expect(getBotRuntimeOperatorState(snapshot, 10_000)).toBe("closed");
    expect(getBotRuntimeOperatorSummary(snapshot, 10_000)).toEqual({
      code: "closed",
      text: "Bot session closed without an active reconnect loop.",
    });
    expect(getBotRuntimeNextActionHint(snapshot, 10_000)).toBe(
      "Inspect the runtime logs and restart or re-pair the tenant session as needed.",
    );
  });
});
