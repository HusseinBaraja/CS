import { describe, expect, test } from "bun:test";
import { ERROR_CODES } from "@cs/shared";
import { checkDbConnection, DB_PROVIDER } from "./index";

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
        "Convex-Client": "npm-1.32.0",
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
    await expect(
      checkDbConnection(
        {
          provider: DB_PROVIDER,
          url: "https://example.convex.cloud",
        },
        {
          timeoutMs: 50,
          fetch: async (_input, init) => {
            await new Promise((resolve) => setTimeout(resolve, 200));
            if (init?.signal?.aborted) {
              throw new DOMException("The operation was aborted", "AbortError");
            }
            return new Response(JSON.stringify({ ts: 1 }), { status: 200 });
          },
        },
      ),
    ).rejects.toMatchObject({
      code: ERROR_CODES.DB_CONNECTION_FAILED,
      message: "Database connection failed",
    });
  });
});
