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

  test("rate limiting throttles repeated missing auth failures", async () => {
    const app = createApp({
      runtimeConfig: {
        apiKey: "test-api-key",
        rateLimitMax: 1,
        rateLimitWindowMs: 60_000
      },
      getClientId: () => "ip:203.0.113.10"
    });

    const first = await app.request("/api");
    const second = await app.request("/api");
    const body = await second.json();

    expect(first.status).toBe(401);
    expect(second.status).toBe(429);
    expect(body).toEqual({
      ok: false,
      error: {
        code: ERROR_CODES.RATE_LIMIT_EXCEEDED,
        message: "Rate limit exceeded"
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

  test("rate limiting throttles repeated invalid auth failures", async () => {
    const app = createApp({
      runtimeConfig: {
        apiKey: "test-api-key",
        rateLimitMax: 1,
        rateLimitWindowMs: 60_000
      },
      getClientId: () => "ip:203.0.113.11"
    });

    const headers = {
      "x-api-key": "wrong-key"
    };
    const first = await app.request("/api", { headers });
    const second = await app.request("/api", { headers });
    const body = await second.json();

    expect(first.status).toBe(403);
    expect(second.status).toBe(429);
    expect(body).toEqual({
      ok: false,
      error: {
        code: ERROR_CODES.RATE_LIMIT_EXCEEDED,
        message: "Rate limit exceeded"
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

  test("empty API key headers fall back to bearer auth", async () => {
    const app = createApp({
      runtimeConfig: {
        apiKey: "test-api-key"
      }
    });

    const response = await app.request("/api", {
      headers: {
        "x-api-key": "",
        authorization: "Bearer test-api-key"
      }
    });

    expect(response.status).toBe(200);
  });

  test("whitespace API key headers fall back to bearer auth", async () => {
    const app = createApp({
      runtimeConfig: {
        apiKey: "test-api-key"
      }
    });

    const response = await app.request("/api", {
      headers: {
        "x-api-key": "   ",
        authorization: "Bearer test-api-key"
      }
    });

    expect(response.status).toBe(200);
  });

  test("whitespace API key headers without bearer auth return 401", async () => {
    const app = createApp({
      runtimeConfig: {
        apiKey: "test-api-key"
      }
    });

    const response = await app.request("/api", {
      headers: {
        "x-api-key": "   "
      }
    });
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

  test("non-blank invalid API key headers still take precedence over bearer auth", async () => {
    const app = createApp({
      runtimeConfig: {
        apiKey: "test-api-key"
      }
    });

    const response = await app.request("/api", {
      headers: {
        "x-api-key": "wrong-key",
        authorization: "Bearer test-api-key"
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
      "x-api-key": "test-api-key"
    };
    const env = {
      incoming: {
        socket: {
          remoteAddress: "203.0.113.5"
        }
      }
    };

    const first = await app.request("/api", { headers }, env);
    const second = await app.request("/api", { headers }, env);
    const third = await app.request("/api", { headers }, env);
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

  test("rate limiting uses injected now and client identity before auth", async () => {
    let nowCalls = 0;
    let clientIdCalls = 0;
    const app = createApp({
      runtimeConfig: {
        apiKey: "test-api-key",
        rateLimitMax: 1,
        rateLimitWindowMs: 60_000
      },
      now: () => {
        nowCalls += 1;
        return 1_000;
      },
      getClientId: () => {
        clientIdCalls += 1;
        return "ip:203.0.113.12";
      }
    });

    const first = await app.request("/api");
    const second = await app.request("/api");

    expect(first.status).toBe(401);
    expect(first.headers.get("X-RateLimit-Limit")).toBe("1");
    expect(second.status).toBe(429);
    expect(nowCalls).toBe(2);
    expect(clientIdCalls).toBe(2);
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
    }, {
      incoming: {
        socket: {
          remoteAddress: "198.51.100.1"
        }
      }
    });
    const second = await app.request("/api", {
      headers: {
        "x-api-key": "test-api-key",
        "x-forwarded-for": "203.0.113.6"
      }
    }, {
      incoming: {
        socket: {
          remoteAddress: "198.51.100.1"
        }
      }
    });

    expect(first.status).toBe(200);
    expect(second.status).toBe(429);
  });

  test("rate limiting applies one quota across protected API routes", async () => {
    const app = createApp({
      runtimeConfig: {
        apiKey: "test-api-key",
        rateLimitMax: 1,
        rateLimitWindowMs: 60_000
      }
    });

    const env = {
      incoming: {
        socket: {
          remoteAddress: "203.0.113.5"
        }
      }
    };
    const first = await app.request("/api", {
      headers: {
        "x-api-key": "test-api-key"
      }
    }, env);
    const second = await app.request("/api/missing", {
      headers: {
        "x-api-key": "test-api-key"
      }
    }, env);

    expect(first.status).toBe(200);
    expect(second.status).toBe(429);
  });

  test("rate limiting falls back to the connection IP when forwarded headers are absent", async () => {
    const app = createApp({
      runtimeConfig: {
        apiKey: "test-api-key",
        rateLimitMax: 1,
        rateLimitWindowMs: 60_000
      }
    });

    const headers = {
      "x-api-key": "test-api-key"
    };

    const first = await app.request(
      "/api",
      { headers },
      {
        incoming: {
          socket: {
            remoteAddress: "203.0.113.5"
          }
        }
      }
    );
    const second = await app.request(
      "/api",
      { headers },
      {
        incoming: {
          socket: {
            remoteAddress: "203.0.113.6"
          }
        }
      }
    );

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
  });

  test("rate limiting can trust forwarded IPs when proxy hops are configured", async () => {
    const app = createApp({
      runtimeConfig: {
        apiKey: "test-api-key",
        rateLimitMax: 1,
        rateLimitWindowMs: 60_000,
        trustProxyHops: 1,
        trustedProxyIps: ["192.0.2.10"]
      }
    });

    const first = await app.request("/api", {
      headers: {
        "x-api-key": "test-api-key",
        "x-forwarded-for": "198.51.100.10, 192.0.2.10"
      }
    }, {
      incoming: {
        socket: {
          remoteAddress: "192.0.2.10"
        }
      }
    });
    const second = await app.request("/api", {
      headers: {
        "x-api-key": "test-api-key",
        "x-forwarded-for": "198.51.100.11, 192.0.2.10"
      }
    }, {
      incoming: {
        socket: {
          remoteAddress: "::ffff:192.0.2.10"
        }
      }
    });

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
  });

  test("malformed JSON without a content type returns 400", async () => {
    const app = createApp({
      runtimeConfig: {
        apiKey: "test-api-key"
      }
    });

    const response = await app.request("/api/companies", {
      method: "POST",
      headers: {
        "x-api-key": "test-api-key"
      },
      body: "{"
    });
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body).toEqual({
      ok: false,
      error: {
        code: ERROR_CODES.VALIDATION_FAILED,
        message: "Malformed JSON body"
      }
    });
  });

  test("malformed JSON with a non-JSON content type returns 400", async () => {
    const app = createApp({
      runtimeConfig: {
        apiKey: "test-api-key"
      }
    });

    const response = await app.request("/api/companies", {
      method: "POST",
      headers: {
        "x-api-key": "test-api-key",
        "content-type": "text/plain"
      },
      body: "{"
    });
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body).toEqual({
      ok: false,
      error: {
        code: ERROR_CODES.VALIDATION_FAILED,
        message: "Malformed JSON body"
      }
    });
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
