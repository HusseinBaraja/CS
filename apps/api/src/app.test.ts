import { describe, expect, test } from 'bun:test';
import { ConfigError, ERROR_CODES } from '@cs/shared';
import { createApp } from './app';

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

  test("readiness reports missing database configuration without leaking the url", async () => {
    const warnings: Array<{ payload: Record<string, unknown>; message: string }> = [];
    const app = createApp({
      createDbConnection: () => {
        throw new ConfigError("Missing required environment variable: CONVEX_URL", {
          code: ERROR_CODES.CONFIG_MISSING
        });
      },
      logger: {
        warn: (payload, message) => {
          warnings.push({ payload, message });
        }
      }
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
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toEqual({
      message: "api readiness check failed",
      payload: {
        dependency: "db",
        provider: "convex",
        errName: "ConfigError",
        errMessage: "Missing required environment variable: [redacted]"
      }
    });
    expect(JSON.stringify(warnings[0])).not.toContain("CONVEX_URL");
  });

  test("readiness logs a redacted generic error and keeps the fallback 503 payload", async () => {
    const warnings: Array<{ payload: Record<string, unknown>; message: string }> = [];
    const app = createApp({
      createDbConnection: () => {
        throw new Error("database check failed for https://secret.example/token");
      },
      logger: {
        warn: (payload, message) => {
          warnings.push({ payload, message });
        }
      }
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
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toEqual({
      message: "api readiness check failed",
      payload: {
        dependency: "db",
        provider: "convex",
        errName: "Error",
        errMessage: "database check failed for [redacted-url]"
      }
    });
    expect(JSON.stringify(warnings[0])).not.toContain("https://secret.example/token");
  });

  test("readiness reports DB connection failures as unavailable without leaking secrets", async () => {
    const warnings: Array<{ payload: Record<string, unknown>; message: string }> = [];
    const app = createApp({
      createDbConnection: () => {
        throw new ConfigError("connect failed for https://secret.example/token", {
          code: ERROR_CODES.DB_CONNECTION_FAILED
        });
      },
      logger: {
        warn: (payload, message) => {
          warnings.push({ payload, message });
        }
      }
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
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toEqual({
      message: "api readiness check failed",
      payload: {
        dependency: "db",
        provider: "convex",
        errName: "ConfigError",
        errMessage: "connect failed for [redacted-url]"
      }
    });
    expect(JSON.stringify(warnings[0])).not.toContain("https://secret.example/token");
  });

  test("readiness reports safe database metadata when configuration is present", async () => {
    const app = createApp({
      createDbConnection: () => ({
        provider: "convex",
        url: "https://example.convex.cloud"
      })
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
