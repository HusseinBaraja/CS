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
    expect(config.API_PORT).toBe(3000);
    expect(config.CONVEX_URL).toBe("https://example.convex.cloud");
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
});
