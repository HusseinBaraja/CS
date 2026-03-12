import { describe, expect, test } from 'bun:test';
import type { StandardSchemaV1 } from '@t3-oss/env-core';
import { ConfigError, ERROR_CODES } from '@cs/shared';
import { createConfig, inferConfigErrorCode, requireConfigValue } from './index';

describe("config", () => {
  test("applies defaults for optional setup values", () => {
    const config = createConfig({
      CONVEX_URL: "https://example.convex.cloud"
    });

    expect(config.NODE_ENV).toBe("development");
    expect(config.LOG_LEVEL).toBe("debug");
    expect(config.LOG_DIR).toBe("logs");
    expect(config.LOG_RETENTION_DAYS).toBe(14);
    expect(config.BACKUP_DIR).toBe("backups");
    expect(config.BACKUP_RETENTION_COUNT).toBe(5);
    expect(config.API_PORT).toBe(3000);
    expect(config.API_KEY).toBeUndefined();
    expect(config.GEMINI_API_KEY).toBeUndefined();
    expect(config.API_CORS_ORIGINS).toEqual(["*"]);
    expect(config.API_TRUSTED_PROXY_IPS).toEqual([]);
    expect(config.API_TRUST_PROXY_HOPS).toBe(0);
    expect(config.API_RATE_LIMIT_MAX).toBe(60);
    expect(config.API_RATE_LIMIT_WINDOW_MS).toBe(60_000);
    expect(config.API_RATE_LIMIT_MAX_ENTRIES).toBe(10_000);
    expect(config.CONVEX_URL).toBe("https://example.convex.cloud");
    expect(config.R2_BUCKET_NAME).toBeUndefined();
    expect(config.R2_ENDPOINT).toBeUndefined();
    expect(config.R2_ACCESS_KEY_ID).toBeUndefined();
    expect(config.R2_SECRET_ACCESS_KEY).toBeUndefined();
  });

  test("parses API CORS origins from a comma-separated env value", () => {
    const config = createConfig({
      API_CORS_ORIGINS: "https://one.example, https://two.example",
      CONVEX_URL: "https://example.convex.cloud"
    });

    expect(config.API_CORS_ORIGINS).toEqual([
      "https://one.example",
      "https://two.example"
    ]);
  });

  test("accepts a single wildcard API CORS origin", () => {
    const config = createConfig({
      API_CORS_ORIGINS: "*",
      CONVEX_URL: "https://example.convex.cloud"
    });

    expect(config.API_CORS_ORIGINS).toEqual(["*"]);
  });

  test("treats whitespace-only API CORS origins as the wildcard default", () => {
    const config = createConfig({
      API_CORS_ORIGINS: "   ",
      CONVEX_URL: "https://example.convex.cloud"
    });

    expect(config.API_CORS_ORIGINS).toEqual(["*"]);
  });

  test("canonicalizes valid API CORS origins", () => {
    const config = createConfig({
      API_CORS_ORIGINS: "https://console.example/, https://two.example:8443/",
      CONVEX_URL: "https://example.convex.cloud"
    });

    expect(config.API_CORS_ORIGINS).toEqual([
      "https://console.example",
      "https://two.example:8443"
    ]);
  });

  test("rejects mixed wildcard and explicit API CORS origins", () => {
    expect(() =>
      createConfig({
        API_CORS_ORIGINS: "*,https://console.example",
        CONVEX_URL: "https://example.convex.cloud"
      })
    ).toThrow();
  });

  test("rejects invalid API CORS origins", () => {
    const invalidOrigins = [
      "/relative",
      "ftp://console.example",
      "https://console.example/path",
      "https://console.example?foo=bar",
      "https://console.example#hash",
      "https://",
      "https://user:pass@console.example"
    ];

    for (const origin of invalidOrigins) {
      expect(() =>
        createConfig({
          API_CORS_ORIGINS: origin,
          CONVEX_URL: "https://example.convex.cloud"
        })
      ).toThrow();
    }
  });

  test("parses trusted proxy IPs from a comma-separated env value", () => {
    const config = createConfig({
      API_TRUSTED_PROXY_IPS: "192.0.2.10, ::ffff:203.0.113.10",
      CONVEX_URL: "https://example.convex.cloud"
    });

    expect(config.API_TRUSTED_PROXY_IPS).toEqual([
      "192.0.2.10",
      "::ffff:203.0.113.10"
    ]);
  });

  test("throws ConfigError for invalid values", () => {
    expect(() =>
      createConfig({
        API_PORT: "not-a-port",
        CONVEX_URL: "https://example.convex.cloud"
      })
    ).toThrow(
      new ConfigError("API_PORT: Invalid input: expected number, received NaN", {
        code: ERROR_CODES.CONFIG_INVALID
      })
    );
  });

  test("rejects non-positive API rate limits", () => {
    expect(() =>
      createConfig({
        API_RATE_LIMIT_MAX: 0,
        CONVEX_URL: "https://example.convex.cloud"
      })
    ).toThrow(
      new ConfigError("API_RATE_LIMIT_MAX: Too small: expected number to be >0", {
        code: ERROR_CODES.CONFIG_INVALID
      })
    );
  });

  test("rejects non-positive API rate-limit store capacity", () => {
    expect(() =>
      createConfig({
        API_RATE_LIMIT_MAX_ENTRIES: 0,
        CONVEX_URL: "https://example.convex.cloud"
      })
    ).toThrow(
      new ConfigError("API_RATE_LIMIT_MAX_ENTRIES: Too small: expected number to be >0", {
        code: ERROR_CODES.CONFIG_INVALID
      })
    );
  });

  test("rejects negative trusted proxy hop counts", () => {
    expect(() =>
      createConfig({
        API_TRUST_PROXY_HOPS: -1,
        CONVEX_URL: "https://example.convex.cloud"
      })
    ).toThrow(
      new ConfigError("API_TRUST_PROXY_HOPS: Too small: expected number to be >=0", {
        code: ERROR_CODES.CONFIG_INVALID
      })
    );
  });

  test("classifies provided string type mismatches as CONFIG_INVALID", () => {
    let thrown: unknown;

    try {
      createConfig({
        LOG_DIR: 123,
        CONVEX_URL: "https://example.convex.cloud"
      });
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(ConfigError);
    expect((thrown as ConfigError).code).toBe(ERROR_CODES.CONFIG_INVALID);
  });

  test("classifies missing schema values from runtime input instead of error message text", () => {
    const issues: StandardSchemaV1.Issue[] = [
      {
        message: "anything",
        path: ["CONVEX_URL"]
      }
    ];

    expect(inferConfigErrorCode(issues, {})).toBe(ERROR_CODES.CONFIG_MISSING);
  });

  test("treats empty CONVEX_URL as invalid instead of missing", () => {
    const issues: StandardSchemaV1.Issue[] = [
      {
        message: "anything",
        path: ["CONVEX_URL"]
      }
    ];

    expect(inferConfigErrorCode(issues, { CONVEX_URL: "" })).toBe(ERROR_CODES.CONFIG_INVALID);
  });

  test("treats whitespace-only CONVEX_URL as invalid instead of missing", () => {
    const issues: StandardSchemaV1.Issue[] = [
      {
        message: "anything",
        path: ["CONVEX_URL"]
      }
    ];

    expect(inferConfigErrorCode(issues, { CONVEX_URL: "   " })).toBe(
      ERROR_CODES.CONFIG_INVALID
    );
  });

  test("throws CONFIG_MISSING when a required runtime value is absent", () => {
    const config = createConfig({});

    expect(() => requireConfigValue(config, "CONVEX_URL")).toThrow(
      new ConfigError("Missing required environment variable: CONVEX_URL", {
        code: ERROR_CODES.CONFIG_MISSING
      })
    );
  });

  test("preserves non-string falsy config values", () => {
    const config = {
      API_PORT: 0,
      FEATURE_ENABLED: false
    };

    expect(requireConfigValue(config, "API_PORT")).toBe(0);
    expect(requireConfigValue(config, "FEATURE_ENABLED")).toBe(false);
  });

  test("rejects CONVEX_URL as an empty string during schema parsing before requireEnv()", () => {
    let thrown: unknown;

    try {
      createConfig({
        CONVEX_URL: ""
      });
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(ConfigError);
    expect((thrown as ConfigError).code).toBe(ERROR_CODES.CONFIG_INVALID);
    expect((thrown as ConfigError).message).toContain("CONVEX_URL:");
  });

  test("treats empty optional API auth, Gemini, storage, and CORS env vars as unset values", () => {
    const config = createConfig({
      API_KEY: "",
      GEMINI_API_KEY: "",
      R2_BUCKET_NAME: "",
      R2_ENDPOINT: "",
      R2_ACCESS_KEY_ID: "",
      R2_SECRET_ACCESS_KEY: "",
      API_CORS_ORIGINS: "",
      CONVEX_URL: "https://example.convex.cloud"
    });

    expect(config.API_KEY).toBeUndefined();
    expect(config.GEMINI_API_KEY).toBeUndefined();
    expect(config.API_CORS_ORIGINS).toEqual(["*"]);
    expect(config.CONVEX_ADMIN_KEY).toBeUndefined();
    expect(config.R2_BUCKET_NAME).toBeUndefined();
    expect(config.R2_ENDPOINT).toBeUndefined();
    expect(config.R2_ACCESS_KEY_ID).toBeUndefined();
    expect(config.R2_SECRET_ACCESS_KEY).toBeUndefined();
  });

  test("treats whitespace-only optional secrets as unset values", () => {
    const config = createConfig({
      API_KEY: "   ",
      GEMINI_API_KEY: "   ",
      R2_BUCKET_NAME: "   ",
      R2_ACCESS_KEY_ID: "   ",
      R2_SECRET_ACCESS_KEY: "   ",
      CONVEX_URL: "https://example.convex.cloud"
    });

    expect(config.API_KEY).toBeUndefined();
    expect(config.GEMINI_API_KEY).toBeUndefined();
    expect(config.R2_BUCKET_NAME).toBeUndefined();
    expect(config.R2_ACCESS_KEY_ID).toBeUndefined();
    expect(config.R2_SECRET_ACCESS_KEY).toBeUndefined();
  });

  test("trims optional secrets before returning them", () => {
    const config = createConfig({
      API_KEY: "  secret  ",
      GEMINI_API_KEY: "  gemini-secret  ",
      R2_BUCKET_NAME: "  media  ",
      R2_ENDPOINT: "  https://example.r2.cloudflarestorage.com  ",
      R2_ACCESS_KEY_ID: "  access-key  ",
      R2_SECRET_ACCESS_KEY: "  secret-key  ",
      CONVEX_URL: "https://example.convex.cloud"
    });

    expect(config.API_KEY).toBe("secret");
    expect(config.GEMINI_API_KEY).toBe("gemini-secret");
    expect(config.R2_BUCKET_NAME).toBe("media");
    expect(config.R2_ENDPOINT).toBe("https://example.r2.cloudflarestorage.com");
    expect(config.R2_ACCESS_KEY_ID).toBe("access-key");
    expect(config.R2_SECRET_ACCESS_KEY).toBe("secret-key");
  });

  test("treats empty CONVEX_ADMIN_KEY as an unset value", () => {
    const config = createConfig({
      CONVEX_ADMIN_KEY: "",
      CONVEX_URL: "https://example.convex.cloud"
    });

    expect(config.CONVEX_ADMIN_KEY).toBeUndefined();
  });
});
