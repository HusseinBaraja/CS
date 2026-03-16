import { describe, expect, test } from 'bun:test';
import type { BotRuntimeOperatorSnapshot } from '@cs/shared';
import { createApp } from '../app';
import type { BotRuntimeService } from '../services/botRuntime';

const API_KEY = "test-api-key";

const createSnapshot = (
  overrides: Partial<BotRuntimeOperatorSnapshot> = {},
): BotRuntimeOperatorSnapshot => ({
  companyId: "company-1",
  name: "Alpha Packaging",
  ownerPhone: "966500000001",
  timezone: "Asia/Aden",
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
  pairing: {
    state: "none",
  },
  ...overrides,
});

const createStubBotRuntimeService = (
  snapshots: BotRuntimeOperatorSnapshot[],
): BotRuntimeService => ({
  listOperatorSnapshots: async () => snapshots,
});

const createTestApp = (botRuntimeService: BotRuntimeService) =>
  createApp({
    botRuntimeService,
    runtimeConfig: {
      apiKey: API_KEY,
    },
    now: () => 10_000,
  });

describe("bot runtime routes", () => {
  test("GET /runtime/bot returns the public shell without tenant data", async () => {
    const app = createTestApp(createStubBotRuntimeService([
      createSnapshot(),
    ]));

    const response = await app.request("/runtime/bot?companyId=company-1");
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(body).toContain("Bot Runtime Operator View");
    expect(body).toContain("sessionStorage");
    expect(body).not.toContain("Alpha Packaging");
  });

  test("GET /api/runtime/bot/sessions rejects missing and invalid API keys", async () => {
    const app = createTestApp(createStubBotRuntimeService([]));

    const missingKey = await app.request("/api/runtime/bot/sessions");
    const invalidKey = await app.request("/api/runtime/bot/sessions", {
      headers: {
        authorization: "Bearer wrong-key",
      },
    });

    expect(missingKey.status).toBe(401);
    expect(invalidKey.status).toBe(403);
  });

  test("GET /api/runtime/bot/sessions returns derived operator fields and QR SVG without raw QR text", async () => {
    const app = createTestApp(createStubBotRuntimeService([
      createSnapshot({
        companyId: "company-ready",
        name: "Ready Tenant",
        ownerPhone: "966500000101",
        sessionKey: "company-ready-session",
        session: {
          companyId: "company-ready",
          runtimeOwnerId: "runtime-owner-1",
          sessionKey: "company-ready-session",
          state: "awaiting_pairing",
          attempt: 0,
          hasQr: true,
          updatedAt: 1_000,
          leaseExpiresAt: 61_000,
        },
        pairing: {
          state: "ready",
          updatedAt: 1_500,
          expiresAt: 61_500,
          qrText: "qr-live",
        },
      }),
      createSnapshot({
        companyId: "company-expired",
        name: "Expired Tenant",
        ownerPhone: "966500000102",
        sessionKey: "company-expired-session",
        session: {
          companyId: "company-expired",
          runtimeOwnerId: "runtime-owner-1",
          sessionKey: "company-expired-session",
          state: "awaiting_pairing",
          attempt: 0,
          hasQr: false,
          updatedAt: 2_000,
          leaseExpiresAt: 62_000,
        },
        pairing: {
          state: "expired",
          updatedAt: 2_500,
          expiresAt: 2_400,
        },
      }),
      createSnapshot({
        companyId: "company-retrying",
        name: "Retry Tenant",
        ownerPhone: "966500000103",
        sessionKey: "company-retrying-session",
        session: {
          companyId: "company-retrying",
          runtimeOwnerId: "runtime-owner-1",
          sessionKey: "company-retrying-session",
          state: "reconnecting",
          attempt: 2,
          hasQr: false,
          disconnectCode: 428,
          updatedAt: 3_000,
          leaseExpiresAt: 63_000,
        },
        pairing: {
          state: "none",
        },
      }),
      createSnapshot({
        companyId: "company-stale",
        name: "Stale Tenant",
        ownerPhone: "966500000104",
        sessionKey: "company-stale-session",
        session: {
          companyId: "company-stale",
          runtimeOwnerId: "runtime-owner-1",
          sessionKey: "company-stale-session",
          state: "open",
          attempt: 0,
          hasQr: false,
          updatedAt: 4_000,
          leaseExpiresAt: 9_000,
        },
        pairing: {
          state: "none",
        },
      }),
    ]));

    const response = await app.request("/api/runtime/bot/sessions", {
      headers: {
        authorization: `Bearer ${API_KEY}`,
      },
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.generatedAt).toBe(10_000);
    expect(JSON.stringify(body)).not.toContain("qr-live");

    const readySession = body.sessions.find((session: { companyId: string }) => session.companyId === "company-ready");
    const expiredSession = body.sessions.find((session: { companyId: string }) => session.companyId === "company-expired");
    const retrySession = body.sessions.find((session: { companyId: string }) => session.companyId === "company-retrying");
    const staleSession = body.sessions.find((session: { companyId: string }) => session.companyId === "company-stale");

    expect(readySession.operatorState).toBe("awaiting_pairing");
    expect(readySession.summary.code).toBe("qr_ready");
    expect(readySession.pairingSvg).toContain("<svg");

    expect(expiredSession.operatorState).toBe("awaiting_pairing");
    expect(expiredSession.summary.code).toBe("qr_expired");
    expect(expiredSession.pairing).toEqual({
      state: "expired",
      updatedAt: 2_500,
      expiresAt: 2_400,
    });

    expect(retrySession.operatorState).toBe("reconnecting");
    expect(retrySession.nextRetryAt).toBe(5_000);
    expect(retrySession.session.disconnectCode).toBe(428);

    expect(staleSession.operatorState).toBe("stale");
    expect(staleSession.summary.code).toBe("stale");
  });
});
