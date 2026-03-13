import { describe, expect, test } from "bun:test";
import { createApiRuntimeConfig } from "./runtimeConfig";

describe("createApiRuntimeConfig", () => {
  test("creates config with valid positive integers", () => {
    const config = createApiRuntimeConfig({
      rateLimitMax: 100,
      rateLimitMaxEntries: 1_000,
      rateLimitWindowMs: 60_000
    });

    expect(config.rateLimitMax).toBe(100);
    expect(config.rateLimitWindowMs).toBe(60_000);
    expect(config.rateLimitMaxEntries).toBe(1_000);
  });

  test("normalizes runtime overrides to match env-backed config", () => {
    const config = createApiRuntimeConfig({
      apiKey: "  secret  ",
      corsOrigins: ["https://console.example/", "https://two.example:8443/"],
      rateLimitMax: 100,
      rateLimitMaxEntries: 1_000,
      rateLimitWindowMs: 60_000,
      trustProxyHops: 2
    });

    expect(config.apiKey).toBe("secret");
    expect(config.corsOrigins).toEqual([
      "https://console.example",
      "https://two.example:8443"
    ]);
    expect(config.trustProxyHops).toBe(2);
  });

  test("treats an explicit undefined apiKey override as disabled auth instead of falling back to env", () => {
    const config = createApiRuntimeConfig({
      apiKey: undefined,
      rateLimitMax: 100,
      rateLimitMaxEntries: 1_000,
      rateLimitWindowMs: 60_000,
    });

    expect(config.apiKey).toBeUndefined();
  });

  test("throws when rateLimitMax is zero", () => {
    expect(() => createApiRuntimeConfig({ rateLimitMax: 0 })).toThrow(
      "Invalid ApiRuntimeConfig.rateLimitMax: expected a positive integer, received 0",
    );
  });

  test("throws when rateLimitMax is negative", () => {
    expect(() => createApiRuntimeConfig({ rateLimitMax: -1 })).toThrow(
      "Invalid ApiRuntimeConfig.rateLimitMax: expected a positive integer, received -1",
    );
  });

  test("throws when rateLimitMax is fractional", () => {
    expect(() => createApiRuntimeConfig({ rateLimitMax: 1.5 })).toThrow(
      "Invalid ApiRuntimeConfig.rateLimitMax: expected a positive integer, received 1.5",
    );
  });

  test("throws when rateLimitWindowMs is zero", () => {
    expect(() => createApiRuntimeConfig({ rateLimitWindowMs: 0 })).toThrow(
      "Invalid ApiRuntimeConfig.rateLimitWindowMs: expected a positive integer, received 0",
    );
  });

  test("throws when rateLimitWindowMs is negative", () => {
    expect(() => createApiRuntimeConfig({ rateLimitWindowMs: -1 })).toThrow(
      "Invalid ApiRuntimeConfig.rateLimitWindowMs: expected a positive integer, received -1",
    );
  });

  test("throws when rateLimitWindowMs is fractional", () => {
    expect(() => createApiRuntimeConfig({ rateLimitWindowMs: 1000.5 })).toThrow(
      "Invalid ApiRuntimeConfig.rateLimitWindowMs: expected a positive integer, received 1000.5",
    );
  });

  test("throws when rateLimitMaxEntries is zero", () => {
    expect(() => createApiRuntimeConfig({ rateLimitMaxEntries: 0 })).toThrow(
      "Invalid ApiRuntimeConfig.rateLimitMaxEntries: expected a positive integer, received 0",
    );
  });

  test("throws when rateLimitMaxEntries is negative", () => {
    expect(() => createApiRuntimeConfig({ rateLimitMaxEntries: -1 })).toThrow(
      "Invalid ApiRuntimeConfig.rateLimitMaxEntries: expected a positive integer, received -1",
    );
  });

  test("throws when rateLimitMaxEntries is fractional", () => {
    expect(() => createApiRuntimeConfig({ rateLimitMaxEntries: 1000.5 })).toThrow(
      "Invalid ApiRuntimeConfig.rateLimitMaxEntries: expected a positive integer, received 1000.5",
    );
  });

  test("throws when trustProxyHops is negative", () => {
    expect(() => createApiRuntimeConfig({ trustProxyHops: -1 })).toThrow(
      "Invalid ApiRuntimeConfig.trustProxyHops: expected a non-negative integer, received -1",
    );
  });
});
