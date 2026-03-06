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
    const app = createApp({
      createDbConnection: () => {
        throw new ConfigError("Missing required environment variable: CONVEX_URL", {
          code: ERROR_CODES.CONFIG_MISSING
        });
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
    expect(JSON.stringify(body)).not.toContain("CONVEX_URL");
    expect(JSON.stringify(body)).not.toContain("url");
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
