import { describe, expect, test } from 'bun:test';
import type { StructuredLogger } from '@cs/core';
import { ConfigError, ERROR_CODES } from '@cs/shared';
import { createApp } from './app';

const createLogCollector = () => {
  const records: Array<{
    level: "info" | "warn" | "error";
    payload: Record<string, unknown>;
    message: string;
  }> = [];

  const createLogger = (bindings: Record<string, unknown> = {}): StructuredLogger => ({
    debug: (payload, message) => {
      records.push({ level: "info", payload: { ...bindings, ...payload }, message });
    },
    info: (payload, message) => {
      records.push({ level: "info", payload: { ...bindings, ...payload }, message });
    },
    warn: (payload, message) => {
      records.push({ level: "warn", payload: { ...bindings, ...payload }, message });
    },
    error: (payload, message) => {
      records.push({ level: "error", payload: { ...bindings, ...payload }, message });
    },
    child: (childBindings) => createLogger({ ...bindings, ...childBindings }),
  });

  return {
    records,
    logger: createLogger(),
  };
};

describe("api app", () => {
  test("createApp fails fast for invalid runtime rate-limit overrides", () => {
    expect(() =>
      createApp({
        runtimeConfig: {
          rateLimitMax: 0
        }
      })
    ).toThrow(
      "Invalid ApiRuntimeConfig.rateLimitMax: expected a positive integer, received 0"
    );
  });

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

  test("propagates X-Request-Id and logs terminal request metadata", async () => {
    const logCollector = createLogCollector();
    const app = createApp({
      logger: logCollector.logger,
      runtimeConfig: {
        apiKey: "test-api-key"
      },
    });

    const response = await app.request("/api", {
      headers: {
        "x-api-key": "test-api-key",
        "x-request-id": "req-123",
      },
    });

    expect(response.headers.get("X-Request-Id")).toBe("req-123");
    expect(logCollector.records).toContainEqual({
      level: "info",
      message: "api request completed",
      payload: {
        runtime: "api",
        surface: "http",
        requestId: "req-123",
        event: "api.request.completed",
        outcome: "success",
        authOutcome: "authenticated",
        durationMs: expect.any(Number),
        method: "GET",
        path: "/api",
        statusCode: 200,
      },
    });
  });

  test("generates X-Request-Id when the client does not provide one", async () => {
    const logCollector = createLogCollector();
    const app = createApp({
      logger: logCollector.logger,
    });

    const response = await app.request("/api/health");
    const requestId = response.headers.get("X-Request-Id");

    expect(requestId).toEqual(expect.any(String));
    expect(requestId?.length ?? 0).toBeGreaterThan(0);
    expect(
      logCollector.records.some((record) =>
        record.level === "info" &&
        record.payload.event === "api.request.completed" &&
        record.payload.requestId === requestId
      ),
    ).toBe(true);
  });

  test("falls back to unauthorized when a downstream route returns 401 without authOutcome", async () => {
    const logCollector = createLogCollector();
    const app = createApp({
      logger: logCollector.logger,
      runtimeConfig: {
        apiKey: "test-api-key",
      },
    });
    app.get("/api/fallback-auth-401", (c) => {
      c.set("authOutcome", undefined);
      return c.json({ ok: false }, 401);
    });

    const response = await app.request("/api/fallback-auth-401", {
      headers: {
        "x-api-key": "test-api-key",
      },
    });

    expect(response.status).toBe(401);
    expect(logCollector.records).toContainEqual({
      level: "info",
      message: "api request completed",
      payload: expect.objectContaining({
        event: "api.request.completed",
        authOutcome: "unauthorized",
        statusCode: 401,
        path: "/api/fallback-auth-401",
      }),
    });
  });

  test("falls back to forbidden when a downstream route returns 403 without authOutcome", async () => {
    const logCollector = createLogCollector();
    const app = createApp({
      logger: logCollector.logger,
      runtimeConfig: {
        apiKey: "test-api-key",
      },
    });
    app.get("/api/fallback-auth-403", (c) => {
      c.set("authOutcome", undefined);
      return c.json({ ok: false }, 403);
    });

    const response = await app.request("/api/fallback-auth-403", {
      headers: {
        "x-api-key": "test-api-key",
      },
    });

    expect(response.status).toBe(403);
    expect(logCollector.records).toContainEqual({
      level: "info",
      message: "api request completed",
      payload: expect.objectContaining({
        event: "api.request.completed",
        authOutcome: "forbidden",
        statusCode: 403,
        path: "/api/fallback-auth-403",
      }),
    });
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
    expect(nowCalls).toBeGreaterThanOrEqual(2);
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

  test("logs validation failures without leaking auth values", async () => {
    const logCollector = createLogCollector();
    const app = createApp({
      logger: logCollector.logger,
      runtimeConfig: {
        apiKey: "test-api-key"
      }
    });

    const response = await app.request("/api/companies", {
      method: "POST",
      headers: {
        "x-api-key": "test-api-key",
        "x-request-id": "req-validation",
      },
      body: "{",
    });

    expect(response.status).toBe(400);
    expect(logCollector.records).toContainEqual({
      level: "warn",
      message: "api request validation failed",
      payload: {
        runtime: "api",
        surface: "http",
        requestId: "req-validation",
        event: "api.request.validation_failed",
        outcome: "invalid",
        method: "POST",
        path: "/api/companies",
        statusCode: 400,
        error: expect.objectContaining({
          name: "SyntaxError",
        }),
      },
    });
    expect(JSON.stringify(logCollector.records)).not.toContain("test-api-key");
  });

  test("readiness reports missing database configuration without leaking the url", async () => {
    const logCollector = createLogCollector();
    const app = createApp({
      createDbConnection: () => {
        throw new ConfigError("Missing required environment variable: CONVEX_URL", {
          code: ERROR_CODES.CONFIG_MISSING
        });
      },
      logger: logCollector.logger
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
    const warnings = logCollector.records.filter((record) => record.level === "warn");
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toEqual({
      level: "warn",
      message: "api readiness check failed",
      payload: {
        event: "api.readiness.failed",
        runtime: "api",
        surface: "readiness",
        outcome: "degraded",
        dependency: "db",
        error: expect.objectContaining({
          name: "ConfigError",
          message: "Missing required environment variable: [redacted]",
        }),
        provider: "convex",
        errName: "ConfigError",
        errMessage: "Missing required environment variable: [redacted]",
        requestId: expect.any(String),
      }
    });
    expect(JSON.stringify(warnings[0])).not.toContain("CONVEX_URL");
  });

  test("readiness logs a redacted generic error and keeps the fallback 503 payload", async () => {
    const logCollector = createLogCollector();
    const app = createApp({
      createDbConnection: () => {
        throw new Error("database check failed for https://secret.example/token");
      },
      logger: logCollector.logger
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
    const warnings = logCollector.records.filter((record) => record.level === "warn");
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toEqual({
      level: "warn",
      message: "api readiness check failed",
      payload: {
        event: "api.readiness.failed",
        runtime: "api",
        surface: "readiness",
        outcome: "degraded",
        dependency: "db",
        error: expect.objectContaining({
          name: "Error",
          message: "database check failed for [redacted-url]",
        }),
        provider: "convex",
        errName: "Error",
        errMessage: "database check failed for [redacted-url]",
        requestId: expect.any(String),
      }
    });
    expect(JSON.stringify(warnings[0])).not.toContain(
      "https://secret.example/token"
    );
  });

  test("readiness reports DB connection failures as unavailable without leaking secrets", async () => {
    const logCollector = createLogCollector();
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
      logger: logCollector.logger
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
    const warnings = logCollector.records.filter((record) => record.level === "warn");
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toEqual({
      level: "warn",
      message: "api readiness check failed",
      payload: {
        event: "api.readiness.failed",
        runtime: "api",
        surface: "readiness",
        outcome: "degraded",
        dependency: "db",
        error: expect.objectContaining({
          name: "Error",
          message: "connect failed for [redacted-url]",
        }),
        provider: "convex",
        errName: "Error",
        errMessage: "connect failed for [redacted-url]",
        requestId: expect.any(String),
      }
    });
    expect(JSON.stringify(warnings[0])).not.toContain(
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
