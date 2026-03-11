import { describe, expect, test } from "bun:test";
import { Hono } from "hono";
import { createApiKeyAuthMiddleware } from "./auth";

describe("api key auth middleware", () => {
  test("exempt paths do not set authenticatedClientId", async () => {
    const app = new Hono();
    app.use("*", createApiKeyAuthMiddleware({ apiKey: "test-api-key" }));
    app.get("/api/health", (c) =>
      c.json({
        authenticatedClientId: c.get("authenticatedClientId") ?? null,
      }),
    );

    const response = await app.request("/api/health");

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      authenticatedClientId: null,
    });
  });

  test("protected routes receive authenticatedClientId after successful auth", async () => {
    const app = new Hono();
    app.use("*", createApiKeyAuthMiddleware({ apiKey: "test-api-key" }));
    app.get("/api/companies", (c) =>
      c.json({
        authenticatedClientId: c.get("authenticatedClientId"),
      }),
    );

    const response = await app.request("/api/companies", {
      headers: {
        "x-api-key": "test-api-key",
      },
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      authenticatedClientId: expect.any(String),
    });
  });
});
