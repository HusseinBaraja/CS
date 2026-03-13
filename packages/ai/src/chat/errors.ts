import { AIError, type AppErrorOptions, ERROR_CODES } from '@cs/shared';
import type { ChatProviderName } from './contracts';

export type ChatProviderErrorKind =
  | "configuration"
  | "authentication"
  | "rate_limit"
  | "timeout"
  | "unavailable"
  | "invalid_request"
  | "response_format"
  | "unknown";

export type ChatProviderErrorDisposition =
  | "retry_same_provider"
  | "failover_provider"
  | "do_not_retry";

export interface ChatProviderErrorOptions extends AppErrorOptions {
  provider: ChatProviderName;
  kind: ChatProviderErrorKind;
  disposition: ChatProviderErrorDisposition;
  retryable: boolean;
  statusCode?: number;
  model?: string;
}

const getErrorCode = (kind: ChatProviderErrorKind): string =>
  kind === "timeout" ? ERROR_CODES.AI_TIMEOUT : ERROR_CODES.AI_PROVIDER_FAILED;

const getDefaultDisposition = (
  kind: ChatProviderErrorKind,
): ChatProviderErrorDisposition => {
  switch (kind) {
    case "timeout":
      return "retry_same_provider";
    case "rate_limit":
    case "unavailable":
    case "unknown":
      return "failover_provider";
    case "configuration":
    case "authentication":
    case "invalid_request":
    case "response_format":
      return "do_not_retry";
  }
};

const getDefaultRetryable = (disposition: ChatProviderErrorDisposition): boolean =>
  disposition !== "do_not_retry";

export class ChatProviderError extends AIError {
  readonly provider: ChatProviderName;
  readonly kind: ChatProviderErrorKind;
  readonly disposition: ChatProviderErrorDisposition;
  readonly retryable: boolean;
  readonly statusCode?: number;
  readonly model?: string;

  constructor(message: string, options: ChatProviderErrorOptions) {
    super(message, {
      cause: options.cause,
      context: {
        ...(options.context ?? {}),
        provider: options.provider,
        kind: options.kind,
        disposition: options.disposition,
        retryable: options.retryable,
        ...(options.statusCode !== undefined ? { statusCode: options.statusCode } : {}),
        ...(options.model !== undefined ? { model: options.model } : {}),
      },
    });

    Object.defineProperty(this, "code", {
      configurable: true,
      enumerable: true,
      value: getErrorCode(options.kind),
      writable: true,
    });

    this.provider = options.provider;
    this.kind = options.kind;
    this.disposition = options.disposition;
    this.retryable = options.retryable;
    this.statusCode = options.statusCode;
    this.model = options.model;
  }
}

export interface CreateChatProviderErrorOptions extends AppErrorOptions {
  provider: ChatProviderName;
  kind: ChatProviderErrorKind;
  message: string;
  disposition?: ChatProviderErrorDisposition;
  retryable?: boolean;
  statusCode?: number;
  model?: string;
}

export const createChatProviderError = (
  options: CreateChatProviderErrorOptions,
): ChatProviderError => {
  const disposition = options.disposition ?? getDefaultDisposition(options.kind);

  return new ChatProviderError(options.message, {
    ...options,
    disposition,
    retryable: options.retryable ?? getDefaultRetryable(disposition),
  });
};
