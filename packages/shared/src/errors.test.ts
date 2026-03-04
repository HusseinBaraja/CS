import { describe, expect, test } from "bun:test";
import {
  AIError,
  AppError,
  AuthError,
  ConfigError,
  DatabaseError,
  ERROR_CODES,
  ValidationError,
  WhatsAppError,
  formatError
} from "./errors";

describe("error hierarchy", () => {
  test("all domain errors extend AppError", () => {
    expect(new ConfigError("Config issue") instanceof AppError).toBe(true);
    expect(new DatabaseError("DB issue") instanceof AppError).toBe(true);
    expect(new AIError("AI issue") instanceof AppError).toBe(true);
    expect(new WhatsAppError("WA issue") instanceof AppError).toBe(true);
    expect(new AuthError("Auth issue") instanceof AppError).toBe(true);
    expect(new ValidationError("Validation issue") instanceof AppError).toBe(true);
  });
});

describe("error serialization", () => {
  test("AppError serializes required metadata", () => {
    const error = new AppError(ERROR_CODES.CONFIG_MISSING, "Missing key", {
      cause: new Error("ENV var not found"),
      context: { module: "config", key: "API_KEY" }
    });

    const payload = error.toJSON();
    expect(payload.code).toBe(ERROR_CODES.CONFIG_MISSING);
    expect(payload.message).toBe("Missing key");
    expect(payload.context).toEqual({ module: "config", key: "API_KEY" });
    expect(payload.cause).toMatchObject({
      message: "ENV var not found"
    });
  });

  test("domain errors serialize stable codes", () => {
    expect(new ConfigError("Invalid config").toJSON().code).toBe(ERROR_CODES.CONFIG_INVALID);
    expect(new DatabaseError("Connection failed").toJSON().code).toBe(
      ERROR_CODES.DB_QUERY_FAILED
    );
    expect(new AIError("Provider down").toJSON().code).toBe(ERROR_CODES.AI_PROVIDER_FAILED);
    expect(new WhatsAppError("Socket failed").toJSON().code).toBe(
      ERROR_CODES.WHATSAPP_CONNECTION_FAILED
    );
    expect(new AuthError("Token invalid").toJSON().code).toBe(ERROR_CODES.AUTH_FAILED);
    expect(new ValidationError("Payload invalid").toJSON().code).toBe(
      ERROR_CODES.VALIDATION_FAILED
    );
  });
});

describe("formatError", () => {
  test("formats AppError instances", () => {
    const error = new ValidationError("Invalid payload", {
      context: { module: "api" }
    });

    const formatted = formatError(error, { requestId: "req-1" });
    expect(formatted).toMatchObject({
      code: ERROR_CODES.VALIDATION_FAILED,
      message: "Invalid payload",
      context: {
        module: "api",
        requestId: "req-1"
      }
    });
  });

  test("formats native Error instances", () => {
    const error = new Error("boom");
    const formatted = formatError(error, { module: "worker" });
    expect(formatted).toMatchObject({
      name: "Error",
      message: "boom",
      context: { module: "worker" }
    });
  });

  test("formats non-error values safely", () => {
    const formatted = formatError({ bad: "value" }, { source: "test" });
    expect(formatted).toEqual({
      name: "UnknownError",
      message: "Non-error value thrown",
      value: { bad: "value" },
      context: { source: "test" }
    });
  });
});