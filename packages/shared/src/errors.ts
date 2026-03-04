export const ERROR_CODES = {
  CONFIG_MISSING: "CONFIG_MISSING",
  CONFIG_INVALID: "CONFIG_INVALID",
  DB_CONNECTION_FAILED: "DB_CONNECTION_FAILED",
  DB_QUERY_FAILED: "DB_QUERY_FAILED",
  AI_PROVIDER_FAILED: "AI_PROVIDER_FAILED",
  AI_TIMEOUT: "AI_TIMEOUT",
  WHATSAPP_CONNECTION_FAILED: "WHATSAPP_CONNECTION_FAILED",
  AUTH_FAILED: "AUTH_FAILED",
  AUTH_TOKEN_INVALID: "AUTH_TOKEN_INVALID",
  VALIDATION_FAILED: "VALIDATION_FAILED"
} as const;

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];
export type ErrorContext = Record<string, unknown>;

export interface AppErrorOptions {
  cause?: unknown;
  context?: ErrorContext;
}

export interface AppErrorPayload {
  name: string;
  code: string;
  message: string;
  timestamp: string;
  context?: ErrorContext;
  cause?: unknown;
  stack?: string;
}

const toSerializable = (value: unknown, seen = new WeakSet<object>()): unknown => {
  if (value === null || value === undefined) {
    return value;
  }

  const valueType = typeof value;
  if (valueType === "string" || valueType === "number" || valueType === "boolean") {
    return value;
  }

  if (valueType === "bigint") {
    return value.toString();
  }

  if (valueType === "symbol") {
    return value.toString();
  }

  if (valueType === "function") {
    return `[Function ${(value as (...args: unknown[]) => unknown).name || "anonymous"}]`;
  }

  if (Array.isArray(value)) {
    return value.map((item) => toSerializable(item, seen));
  }

  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
      stack: value.stack,
      cause: toSerializable((value as Error & { cause?: unknown }).cause, seen)
    };
  }

  if (valueType === "object") {
    const objectValue = value as Record<string, unknown>;
    if (seen.has(objectValue)) {
      return "[Circular]";
    }

    seen.add(objectValue);
    const output: Record<string, unknown> = {};
    for (const [key, nestedValue] of Object.entries(objectValue)) {
      output[key] = toSerializable(nestedValue, seen);
    }
    seen.delete(objectValue);
    return output;
  }

  return String(value);
};

export class AppError extends Error {
  readonly code: string;
  readonly context?: ErrorContext;
  readonly timestamp: string;
  private readonly errorMessage: string;

  constructor(code: string, message: string, options: AppErrorOptions = {}) {
    super(message, { cause: options.cause });
    this.name = new.target.name;
    this.message = message;
    this.errorMessage = message;
    this.code = code;
    this.context = options.context;
    this.timestamp = new Date().toISOString();
  }

  toJSON(): AppErrorPayload {
    return {
      name: this.name,
      code: this.code,
      message: this.errorMessage,
      timestamp: this.timestamp,
      context: this.context,
      cause: toSerializable((this as Error & { cause?: unknown }).cause),
      stack: this.stack
    };
  }
}

export class ConfigError extends AppError {
  constructor(message: string, options: AppErrorOptions = {}) {
    super(ERROR_CODES.CONFIG_INVALID, message, options);
  }
}

export class DatabaseError extends AppError {
  constructor(message: string, options: AppErrorOptions = {}) {
    super(ERROR_CODES.DB_QUERY_FAILED, message, options);
  }
}

export class AIError extends AppError {
  constructor(message: string, options: AppErrorOptions = {}) {
    super(ERROR_CODES.AI_PROVIDER_FAILED, message, options);
  }
}

export class WhatsAppError extends AppError {
  constructor(message: string, options: AppErrorOptions = {}) {
    super(ERROR_CODES.WHATSAPP_CONNECTION_FAILED, message, options);
  }
}

export class AuthError extends AppError {
  constructor(message: string, options: AppErrorOptions = {}) {
    super(ERROR_CODES.AUTH_FAILED, message, options);
  }
}

export class ValidationError extends AppError {
  constructor(message: string, options: AppErrorOptions = {}) {
    super(ERROR_CODES.VALIDATION_FAILED, message, options);
  }
}

export const formatError = (
  error: unknown,
  extraContext: ErrorContext = {}
): Record<string, unknown> => {
  if (error instanceof AppError) {
    const payload = error.toJSON();
    return {
      ...payload,
      context: {
        ...(payload.context ?? {}),
        ...extraContext
      }
    };
  }

  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
      cause: toSerializable((error as Error & { cause?: unknown }).cause),
      context: extraContext
    };
  }

  return {
    name: "UnknownError",
    message: "Non-error value thrown",
    value: toSerializable(error),
    context: extraContext
  };
};