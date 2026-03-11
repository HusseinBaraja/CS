import { describe, expect, test } from "bun:test";
import { createApiRuntimeConfig } from "./runtimeConfig";

describe("createApiRuntimeConfig", () => {
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
});
