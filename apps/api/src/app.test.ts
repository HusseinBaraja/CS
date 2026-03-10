import { describe, expect, test } from 'bun:test';
import { ConfigError, ERROR_CODES } from '@cs/shared';
import { createApp } from './app';

const createWarningCollector = () => {
  const warnings: Array<{ payload: Record<string, unknown>; message: string }> = [];

  return {
    warnings,
    logger: {
      warn: (payload: Record<string, unknown>, message: string) => {
        warnings.push({ payload, message });
      }
    }
  };
};

describe("api app", () => {
  test("health stays live without touching the database", async () => {
    const app = createApp({
      createDbConnection: () => {
        throw new Error("health route should not access the database");
      }
    });

    const response = await app.request("/api/health");
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      ok: true,
      runtime: "api"
    });
    expect(body).not.toHaveProperty("db");
    expect(JSON.stringify(body)).not.toContain("url");
  });

  test("protected routes fail closed when the API key is not configured", async () => {
    const app = createApp({
      runtimeConfig: {
        apiKey: undefined
      }
    });

    const response = await app.request("/api");
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body).toEqual({
      ok: false,
      error: {
        code: ERROR_CODES.CONFIG_MISSING,
        message: "API authentication is not configured"
      }
    });
  });

  test("missing auth header returns 401", async () => {
    const app = createApp({
      runtimeConfig: {
        apiKey: "test-api-key"
      }
    });

    const response = await app.request("/api");
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body).toEqual({
      ok: false,
      error: {
        code: ERROR_CODES.AUTH_FAILED,
        message: "Missing API key"
      }
    });
  });

  test("invalid same-length API key returns 403", async () => {
    const app = createApp({
      runtimeConfig: {
        apiKey: "test-api-key"
      }
    });

    const response = await app.request("/api", {
      headers: {
        "x-api-key": "wrong-key"
      }
    });
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body).toEqual({
      ok: false,
      error: {
        code: ERROR_CODES.AUTH_TOKEN_INVALID,
        message: "Invalid API key"
      }
    });
  });

  test("invalid different-length API key returns 403", async () => {
    const app = createApp({
      runtimeConfig: {
        apiKey: "test-api-key"
      }
    });

    const response = await app.request("/api", {
      headers: {
        "x-api-key": "short"
      }
    });
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body).toEqual({
      ok: false,
      error: {
        code: ERROR_CODES.AUTH_TOKEN_INVALID,
        message: "Invalid API key"
      }
    });
  });

  test("valid API key allows access to the protected bootstrap route", async () => {
    const app = createApp({
      runtimeConfig: {
        apiKey: "test-api-key"
      }
    });

    const response = await app.request("/api", {
      headers: {
        "x-api-key": "test-api-key"
      }
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      ok: true,
      runtime: "api",
      auth: "api-key"
    });
  });

  test("bearer auth is accepted for protected routes", async () => {
    const app = createApp({
      runtimeConfig: {
        apiKey: "test-api-key"
      }
    });

    const response = await app.request("/api", {
      headers: {
        authorization: "Bearer test-api-key"
      }
    });

    expect(response.status).toBe(200);
  });

  test("CORS preflight succeeds without auth and returns the configured origin", async () => {
    const app = createApp({
      runtimeConfig: {
        apiKey: "test-api-key",
        corsOrigins: ["https://console.example"]
      }
    });

    const response = await app.request("/api", {
      method: "OPTIONS",
      headers: {
        Origin: "https://console.example",
        "Access-Control-Request-Method": "GET"
      }
    });

    expect(response.status).toBe(204);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe(
      "https://console.example"
    );
    expect(response.headers.get("Access-Control-Allow-Methods")).toContain("GET");
  });

  test("/apikey is not treated as a protected API route", async () => {
    const app = createApp({
      runtimeConfig: {
        apiKey: "test-api-key"
      }
    });

    const response = await app.request("/apikey");
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body).toEqual({
      ok: false,
      error: {
        code: "NOT_FOUND",
        message: "Route not found"
      }
    });
  });

  test("/api-v2 is not treated as a protected API route", async () => {
    const app = createApp({
      runtimeConfig: {
        apiKey: "test-api-key"
      }
    });

    const response = await app.request("/api-v2");
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body).toEqual({
      ok: false,
      error: {
        code: "NOT_FOUND",
        message: "Route not found"
      }
    });
  });

  test("rate limiting returns 429 after the configured threshold", async () => {
    const app = createApp({
      runtimeConfig: {
        apiKey: "test-api-key",
        rateLimitMax: 2,
        rateLimitWindowMs: 60_000
      }
    });

    const headers = {
      "x-api-key": "test-api-key",
      "x-forwarded-for": "203.0.113.5"
    };

    const first = await app.request("/api", { headers });
    const second = await app.request("/api", { headers });
    const third = await app.request("/api", { headers });
    const body = await third.json();

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(third.status).toBe(429);
    expect(body).toEqual({
      ok: false,
      error: {
        code: ERROR_CODES.RATE_LIMIT_EXCEEDED,
        message: "Rate limit exceeded"
      }
    });
    expect(third.headers.get("Retry-After")).toBe("60");
    expect(third.headers.get("X-RateLimit-Remaining")).toBe("0");
  });

  test("rate limiting ignores x-forwarded-for rotation by default", async () => {
    const app = createApp({
      runtimeConfig: {
        apiKey: "test-api-key",
        rateLimitMax: 1,
        rateLimitWindowMs: 60_000
      }
    });

    const first = await app.request("/api", {
      headers: {
        "x-api-key": "test-api-key",
        "x-forwarded-for": "203.0.113.5"
      }
    });
    const second = await app.request("/api", {
      headers: {
        "x-api-key": "test-api-key",
        "x-forwarded-for": "203.0.113.6"
      }
    });

    expect(first.status).toBe(200);
    expect(second.status).toBe(429);
  });

  test("rate limiting can trust forwarded IPs when proxy hops are configured", async () => {
    const app = createApp({
      runtimeConfig: {
        apiKey: "test-api-key",
        rateLimitMax: 1,
        rateLimitWindowMs: 60_000,
        trustProxyHops: 1
      }
    });

    const first = await app.request("/api", {
      headers: {
        "x-api-key": "test-api-key",
        "x-forwarded-for": "198.51.100.10, 192.0.2.10"
      }
    });
    const second = await app.request("/api", {
      headers: {
        "x-api-key": "test-api-key",
        "x-forwarded-for": "198.51.100.11, 192.0.2.10"
      }
    });

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
  });

  test("readiness reports missing database configuration without leaking the url", async () => {
    const warningCollector = createWarningCollector();
    const app = createApp({
      createDbConnection: () => {
        throw new ConfigError("Missing required environment variable: CONVEX_URL", {
          code: ERROR_CODES.CONFIG_MISSING
        });
      },
      logger: warningCollector.logger
    });

    const response = await app.request("/api/ready");
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body).toEqual({
      ok: false,
      runtime: "api",
      dependencies: {
        db: {
          provider: "convex",
          ready: false,
          status: "misconfigured",
          message: "Database configuration is invalid or missing"
        }
      }
    });
    expect(JSON.stringify(body)).not.toContain("CONVEX_URL");
    expect(JSON.stringify(body)).not.toContain("url");
    expect(warningCollector.warnings).toHaveLength(1);
    expect(warningCollector.warnings[0]).toEqual({
      message: "api readiness check failed",
      payload: {
        dependency: "db",
        provider: "convex",
        errName: "ConfigError",
        errMessage: "Missing required environment variable: [redacted]"
      }
    });
    expect(JSON.stringify(warningCollector.warnings[0])).not.toContain("CONVEX_URL");
  });

  test("readiness logs a redacted generic error and keeps the fallback 503 payload", async () => {
    const warningCollector = createWarningCollector();
    const app = createApp({
      createDbConnection: () => {
        throw new Error("database check failed for https://secret.example/token");
      },
      logger: warningCollector.logger
    });

    const response = await app.request("/api/ready");
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body).toEqual({
      ok: false,
      runtime: "api",
      dependencies: {
        db: {
          provider: "convex",
          ready: false
        }
      }
    });
    expect(warningCollector.warnings).toHaveLength(1);
    expect(warningCollector.warnings[0]).toEqual({
      message: "api readiness check failed",
      payload: {
        dependency: "db",
        provider: "convex",
        errName: "Error",
        errMessage: "database check failed for [redacted-url]"
      }
    });
    expect(JSON.stringify(warningCollector.warnings[0])).not.toContain(
      "https://secret.example/token"
    );
  });

  test("readiness reports DB connection failures as unavailable without leaking secrets", async () => {
    const warningCollector = createWarningCollector();
    const app = createApp({
      createDbConnection: () => ({
        provider: "convex",
        url: "https://example.convex.cloud"
      }),
      checkDbReady: () => {
        throw Object.assign(new Error("connect failed for https://secret.example/token"), {
          code: ERROR_CODES.DB_CONNECTION_FAILED
        });
      },
      logger: warningCollector.logger
    });

    const response = await app.request("/api/ready");
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body).toEqual({
      ok: false,
      runtime: "api",
      dependencies: {
        db: {
          provider: "convex",
          ready: false,
          status: "unavailable",
          message: "Database connection failed"
        }
      }
    });
    expect(JSON.stringify(body)).not.toContain("https://secret.example/token");
    expect(warningCollector.warnings).toHaveLength(1);
    expect(warningCollector.warnings[0]).toEqual({
      message: "api readiness check failed",
      payload: {
        dependency: "db",
        provider: "convex",
        errName: "Error",
        errMessage: "connect failed for [redacted-url]"
      }
    });
    expect(JSON.stringify(warningCollector.warnings[0])).not.toContain(
      "https://secret.example/token"
    );
  });

  test("readiness reports safe database metadata when configuration is present", async () => {
    const app = createApp({
      createDbConnection: () => ({
        provider: "convex",
        url: "https://example.convex.cloud"
      }),
      checkDbReady: () => undefined
    });

    const response = await app.request("/api/ready");
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      ok: true,
      runtime: "api",
      dependencies: {
        db: {
          provider: "convex",
          ready: true
        }
      }
    });
    expect(JSON.stringify(body)).not.toContain("https://example.convex.cloud");
    expect(JSON.stringify(body)).not.toContain("url");
  });
});
