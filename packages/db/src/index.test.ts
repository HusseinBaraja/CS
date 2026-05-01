import { version as convexVersion } from "convex";
import { describe, expect, test } from "bun:test";
import { ERROR_CODES } from "@cs/shared";
import {
  checkDbConnection,
  ConvexIdValidationError,
  DB_PROVIDER,
  toCompanyId,
  toConversationId,
  toMessageId,
  toProductId,
} from "./index";

describe("@cs/db", () => {
  test("checkDbConnection probes the Convex timestamp endpoint", async () => {
    const fetchCalls: Array<{ input: string; init?: RequestInit }> = [];

    await expect(
      checkDbConnection(
        {
          provider: DB_PROVIDER,
          url: "https://example.convex.cloud",
        },
        {
          fetch: async (input, init) => {
            fetchCalls.push({ input: String(input), init });
            return new Response(JSON.stringify({ ts: 123 }), {
              status: 200,
              headers: {
                "Content-Type": "application/json",
              },
            });
          },
        },
      ),
    ).resolves.toBeUndefined();

    expect(fetchCalls).toHaveLength(1);
    expect(fetchCalls[0]?.input).toBe(
      "https://example.convex.cloud/api/query_ts",
    );
    expect(fetchCalls[0]?.init).toMatchObject({
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Convex-Client": `npm-${convexVersion}`,
      },
    });
    expect(fetchCalls[0]?.init?.signal).toBeInstanceOf(AbortSignal);
  });

  test("checkDbConnection maps transport failures to DB_CONNECTION_FAILED", async () => {
    await expect(
      checkDbConnection(
        {
          provider: DB_PROVIDER,
          url: "https://example.convex.cloud",
        },
        {
          fetch: async () => {
            throw new Error("connect ECONNREFUSED");
          },
        },
      ),
    ).rejects.toMatchObject({
      code: ERROR_CODES.DB_CONNECTION_FAILED,
      message: "Database connection failed",
    });
  });

  test("checkDbConnection rejects unexpected readiness responses", async () => {
    await expect(
      checkDbConnection(
        {
          provider: DB_PROVIDER,
          url: "https://example.convex.cloud",
        },
        {
          fetch: async () =>
            new Response(JSON.stringify({ ok: true }), {
              status: 200,
              headers: {
                "Content-Type": "application/json",
              },
            }),
        },
      ),
    ).rejects.toMatchObject({
      code: ERROR_CODES.DB_CONNECTION_FAILED,
      message: "Database connection failed",
    });
  });

  test("checkDbConnection aborts after timeout", async () => {
    const startedAt = Date.now();

    await expect(
      checkDbConnection(
        {
          provider: DB_PROVIDER,
          url: "https://example.convex.cloud",
        },
        {
          timeoutMs: 50,
          fetch: (_input, init) =>
            new Promise((_resolve, reject) => {
              init?.signal?.addEventListener(
                "abort",
                () =>
                  reject(
                    new DOMException("The operation was aborted", "AbortError"),
                  ),
                { once: true },
              );
            }),
        },
      ),
    ).rejects.toMatchObject({
      code: ERROR_CODES.DB_CONNECTION_FAILED,
      message: "Database connection failed",
    });

    expect(Date.now() - startedAt).toBeLessThan(150);
  });

  test("Convex id adapters trim and return valid ids", () => {
    expect(String(toCompanyId(" company_123 "))).toBe("company_123");
    expect(String(toConversationId("conversation-123"))).toBe("conversation-123");
    expect(String(toMessageId("message_123"))).toBe("message_123");
    expect(String(toProductId("product-123"))).toBe("product-123");
  });

  test("Convex id adapters reject blank or malformed ids", () => {
    expect(() => toCompanyId(" ")).toThrow(ConvexIdValidationError);
    expect(() => toCompanyId("company/123")).toThrow(
      'Invalid companies id "company/123": expected a non-empty identifier containing only letters, numbers, "_" or "-"',
    );
  });
});
