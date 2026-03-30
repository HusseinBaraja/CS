import { createHash } from 'node:crypto';
import { formatError } from '@cs/shared';
import type {
  StructuredLogLevel,
  StructuredLogPayloadInput,
  StructuredLogger,
} from './types';

const PHONE_SUFFIX_LENGTH = 4;

const mergePayload = (
  bindings: Record<string, unknown>,
  payload: Record<string, unknown>,
): Record<string, unknown> => ({
  ...bindings,
  ...payload,
});

const getLogMethod = (
  logger: StructuredLogger,
  level: StructuredLogLevel,
): ((payload: Record<string, unknown>, message: string) => void) => {
  const method = logger[level];
  if (typeof method !== "function") {
    throw new Error(`Structured logger is missing "${level}" method`);
  }

  return method.bind(logger);
};

export const serializeErrorForLog = (
  error: unknown,
  context: Record<string, unknown> = {},
): Record<string, unknown> => formatError(error, context);

export const summarizeTextForLog = (text: string): Record<string, unknown> => {
  const normalizedText = text.trim();
  const lineCount = normalizedText.length === 0 ? 0 : normalizedText.split(/\r?\n/u).length;

  return {
    textLength: text.length,
    textLineCount: lineCount,
    textSha256: createHash("sha256").update(text).digest("hex"),
  };
};

export const redactPhoneLikeValue = (value: string): string => {
  const digits = value.replace(/\D/g, "");
  if (digits.length === 0) {
    return "[redacted]";
  }

  if (digits.length <= PHONE_SUFFIX_LENGTH) {
    return "[redacted]";
  }

  const suffix = digits.slice(-PHONE_SUFFIX_LENGTH);
  return `***${suffix}`;
};

export const redactJidForLog = (value: string): string => {
  const trimmedValue = value.trim();
  if (trimmedValue.length === 0) {
    return "[redacted]";
  }

  const [localPart, domain = ""] = trimmedValue.split("@");
  const redactedLocalPart = redactPhoneLikeValue(localPart);

  return domain.length > 0 ? `${redactedLocalPart}@${domain}` : redactedLocalPart;
};

export const withLogBindings = (
  logger: StructuredLogger,
  bindings: Record<string, unknown>,
): StructuredLogger => {
  if (typeof logger.child === "function") {
    return logger.child(bindings);
  }

  const wrap =
    (method: keyof Pick<StructuredLogger, "debug" | "info" | "warn" | "error">) =>
    (payload: Record<string, unknown>, message: string): void => {
      getLogMethod(logger, method)(mergePayload(bindings, payload), message);
    };

  return {
    debug: wrap("debug"),
    info: wrap("info"),
    warn: wrap("warn"),
    error: wrap("error"),
    child: (childBindings) => withLogBindings(logger, mergePayload(bindings, childBindings)),
  };
};

export const logEvent = (
  logger: StructuredLogger,
  level: StructuredLogLevel,
  payload: StructuredLogPayloadInput,
  message: string,
): void => {
  getLogMethod(logger, level)(payload, message);
};
