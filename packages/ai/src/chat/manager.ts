import { AIError, ERROR_CODES } from '@cs/shared';
import type {
  ChatProviderAdapter,
  ChatProviderHealth,
  ChatProviderName,
  ChatRequest,
  ChatResponse,
} from './contracts';
import { CHAT_PROVIDER_NAMES, getChatProviderAdapter } from './adapters';
import {
  ChatProviderError,
  type ChatProviderErrorDisposition,
  type ChatProviderErrorKind,
  createChatProviderError,
} from './errors';
import { normalizeChatRequest } from './normalize';
import { type ChatRuntimeConfig, createChatRuntimeConfig } from './runtimeConfig';

export interface ChatManagerLogger {
  info(payload: Record<string, unknown>, message: string): void;
  warn(payload: Record<string, unknown>, message: string): void;
  error(payload: Record<string, unknown>, message: string): void;
}

export interface ChatManagerLogContext {
  companyId?: string;
  conversationId?: string;
  requestId?: string;
  feature?: string;
}

export interface ChatManagerCallOptions {
  signal?: AbortSignal;
  timeoutMs?: number;
  maxRetriesPerProvider?: number;
  logContext?: ChatManagerLogContext;
}

export interface ChatProviderAttemptFailure {
  provider: ChatProviderName;
  model?: string;
  kind: ChatProviderErrorKind;
  disposition: ChatProviderErrorDisposition;
  message: string;
  statusCode?: number;
}

export interface ChatProviderProbeOptions {
  providers?: readonly ChatProviderName[];
  signal?: AbortSignal;
  timeoutMs?: number;
  maxRetries?: number;
  logContext?: ChatManagerLogContext;
}

export type ChatProviderChainTerminalDisposition =
  | "do_not_retry"
  | "provider_chain_exhausted";

export type ChatProviderAdapterResolver = (
  provider: ChatProviderName,
) => ChatProviderAdapter;

export interface ChatProviderManager {
  chat(request: ChatRequest, options?: ChatManagerCallOptions): Promise<ChatResponse>;
  probeProviders(options?: ChatProviderProbeOptions): Promise<ChatProviderHealth[]>;
}

export interface CreateChatProviderManagerOptions {
  runtimeConfig?: ChatRuntimeConfig | (() => ChatRuntimeConfig);
  resolveAdapter?: ChatProviderAdapterResolver;
  logger?: ChatManagerLogger;
}

const getChainErrorCode = (
  failures: readonly ChatProviderAttemptFailure[],
): typeof ERROR_CODES.AI_TIMEOUT | typeof ERROR_CODES.AI_PROVIDER_FAILED =>
  failures.length > 0 && failures.every((failure) => failure.kind === "timeout")
    ? ERROR_CODES.AI_TIMEOUT
    : ERROR_CODES.AI_PROVIDER_FAILED;

const toAbortError = (reason: unknown): Error =>
  reason instanceof Error ? reason : new Error("The operation was aborted");

const isAbortError = (error: unknown): boolean =>
  error instanceof Error && error.name === "AbortError";

const throwIfAborted = (
  signal: AbortSignal | undefined,
  reasonOverride?: unknown,
): void => {
  if (signal?.aborted) {
    throw toAbortError(reasonOverride ?? signal.reason);
  }
};

const rethrowIfAborted = (
  signal: AbortSignal | undefined,
  error: unknown,
): void => {
  if (signal?.aborted || isAbortError(error)) {
    throw toAbortError(signal?.reason ?? error);
  }
};

const getErrorMessage = (error: unknown): string =>
  error instanceof Error && error.message.trim().length > 0
    ? error.message
    : String(error);

const normalizeAttemptFailure = (
  error: ChatProviderError,
  fallbackModel?: string,
): ChatProviderAttemptFailure => ({
  provider: error.provider,
  model: error.model ?? fallbackModel,
  kind: error.kind,
  disposition: error.disposition,
  message: error.message,
  ...(error.statusCode !== undefined ? { statusCode: error.statusCode } : {}),
});

const normalizeManagerError = (
  provider: ChatProviderName,
  error: unknown,
  fallbackModel?: string,
): ChatProviderError =>
  error instanceof ChatProviderError
    ? error
    : createChatProviderError({
      provider,
      kind: "unknown",
      message: getErrorMessage(error),
      cause: error instanceof Error ? error : undefined,
      model: fallbackModel,
    });

const toHealthFailure = (
  provider: ChatProviderName,
  error: unknown,
  fallbackModel?: string,
): ChatProviderHealth => ({
  provider,
  ok: false,
  ...(fallbackModel !== undefined ? { model: fallbackModel } : {}),
  error:
    error instanceof ChatProviderError
      ? error
      : createChatProviderError({
        provider,
        kind: "unknown",
        message: getErrorMessage(error),
        cause: error instanceof Error ? error : undefined,
        disposition: "do_not_retry",
        retryable: false,
        model: fallbackModel,
      }),
});

const withLogContext = (
  payload: Record<string, unknown>,
  logContext: ChatManagerLogContext | undefined,
): Record<string, unknown> =>
  logContext ? { ...payload, context: logContext } : payload;

const assertKnownProviders = (
  providers: readonly ChatProviderName[],
): ChatProviderName[] =>
  providers.map((provider) => {
    if (CHAT_PROVIDER_NAMES.includes(provider)) {
      return provider;
    }

    throw new Error(
      `Unknown AI provider "${String(provider)}". Expected one of: ${CHAT_PROVIDER_NAMES.join(", ")}`,
    );
  });

export class ChatProviderChainError extends AIError {
  readonly failures: ChatProviderAttemptFailure[];
  readonly attemptedProviders: ChatProviderName[];
  readonly terminalProvider?: ChatProviderName;
  readonly terminalDisposition: ChatProviderChainTerminalDisposition;

  constructor(
    message: string,
    options: {
      failures: ChatProviderAttemptFailure[];
      attemptedProviders: ChatProviderName[];
      terminalProvider?: ChatProviderName;
      terminalDisposition: ChatProviderChainTerminalDisposition;
      cause?: ChatProviderError;
    },
  ) {
    super(message, {
      cause: options.cause,
      context: {
        failures: options.failures,
        attemptedProviders: options.attemptedProviders,
        ...(options.terminalProvider !== undefined
          ? { terminalProvider: options.terminalProvider }
          : {}),
        terminalDisposition: options.terminalDisposition,
      },
    });

    Object.defineProperty(this, "code", {
      configurable: true,
      enumerable: true,
      value: getChainErrorCode(options.failures),
      writable: true,
    });

    this.failures = options.failures;
    this.attemptedProviders = options.attemptedProviders;
    this.terminalProvider = options.terminalProvider;
    this.terminalDisposition = options.terminalDisposition;
  }
}

const createTerminalChainError = (
  failures: ChatProviderAttemptFailure[],
  terminalDisposition: ChatProviderChainTerminalDisposition,
  cause: ChatProviderError,
): ChatProviderChainError => {
  const attemptedProviders = failures.map((failure) => failure.provider);
  const terminalProvider = attemptedProviders.at(-1);
  const message = terminalDisposition === "do_not_retry"
    ? `${cause.provider} failed with a terminal provider error`
    : `All configured AI providers failed: ${attemptedProviders.join(", ")}`;

  return new ChatProviderChainError(message, {
    failures,
    attemptedProviders,
    terminalProvider,
    terminalDisposition,
    cause,
  });
};

const createRuntimeConfigResolver = (
  runtimeConfig: CreateChatProviderManagerOptions["runtimeConfig"],
): (() => ChatRuntimeConfig) => {
  if (typeof runtimeConfig === "function") {
    return runtimeConfig;
  }

  if (runtimeConfig) {
    return () => runtimeConfig;
  }

  return () => createChatRuntimeConfig();
};

export const createChatProviderManager = (
  options: CreateChatProviderManagerOptions = {},
): ChatProviderManager => {
  const resolveRuntimeConfig = createRuntimeConfigResolver(options.runtimeConfig);
  const resolveAdapter = options.resolveAdapter ?? getChatProviderAdapter;
  const logger = options.logger;
  const safeLog = (
    level: keyof ChatManagerLogger,
    message: string,
    buildPayload: () => Record<string, unknown>,
  ): void => {
    if (!logger) {
      return;
    }

    try {
      logger[level](buildPayload(), message);
    } catch (error) {
      try {
        console.warn("chat manager logging failed", {
          level,
          message,
          error: getErrorMessage(error),
        });
      } catch {
        // Ignore logging fallback failures to preserve chat manager control flow.
      }
    }
  };

  return {
    async chat(request, callOptions = {}) {
      throwIfAborted(callOptions.signal);
      const normalizedRequest = normalizeChatRequest(request);
      throwIfAborted(callOptions.signal);
      const runtimeConfig = resolveRuntimeConfig();
      throwIfAborted(callOptions.signal);

      const startedAt = Date.now();
      const failures: ChatProviderAttemptFailure[] = [];

      for (const [index, provider] of runtimeConfig.providerOrder.entries()) {
        throwIfAborted(callOptions.signal);

        const providerConfig = runtimeConfig.providers[provider];

        try {
          throwIfAborted(callOptions.signal);
          const response = await resolveAdapter(provider).chat(
            normalizedRequest,
            providerConfig,
            {
              signal: callOptions.signal,
              timeoutMs: callOptions.timeoutMs ?? runtimeConfig.requestTimeoutMs,
              maxRetries:
                callOptions.maxRetriesPerProvider ?? runtimeConfig.maxRetriesPerProvider,
            },
          );
          throwIfAborted(callOptions.signal);

          safeLog(
            "info",
            failures.length > 0
              ? "ai provider request succeeded after failover"
              : "ai provider request succeeded",
            () => withLogContext(
              {
                provider,
                model: response.model ?? providerConfig.model,
                durationMs: Date.now() - startedAt,
                failoverOccurred: failures.length > 0,
                attemptedProviders: [...failures.map((failure) => failure.provider), provider],
              },
              callOptions.logContext,
            ),
          );

          return response;
        } catch (error) {
          rethrowIfAborted(callOptions.signal, error);

          const providerError = normalizeManagerError(
            provider,
            error,
            providerConfig.model,
          );
          const failure = normalizeAttemptFailure(providerError, providerConfig.model);
          failures.push(failure);

          const nextProvider = runtimeConfig.providerOrder[index + 1];

          if (providerError.disposition !== "do_not_retry" && nextProvider !== undefined) {
            safeLog(
              "warn",
              "ai provider request failed; failing over to next provider",
              () => withLogContext(
                {
                  provider,
                  model: failure.model,
                  errorKind: failure.kind,
                  disposition: failure.disposition,
                  ...(failure.statusCode !== undefined
                    ? { statusCode: failure.statusCode }
                    : {}),
                  nextProvider,
                },
                callOptions.logContext,
              ),
            );
            continue;
          }

          const terminalDisposition = providerError.disposition === "do_not_retry"
            ? "do_not_retry"
            : "provider_chain_exhausted";
          const chainError = createTerminalChainError(
            failures,
            terminalDisposition,
            providerError,
          );

          safeLog(
            "error",
            "ai provider request failed",
            () => withLogContext(
              {
                attemptedProviders: chainError.attemptedProviders,
                failures: chainError.failures,
                terminalProvider: chainError.terminalProvider,
                terminalDisposition: chainError.terminalDisposition,
              },
              callOptions.logContext,
            ),
          );

          throw chainError;
        }
      }

      throw new Error("AI provider manager failed without a terminal result");
    },

    async probeProviders(probeOptions = {}) {
      throwIfAborted(probeOptions.signal);
      const runtimeConfig = resolveRuntimeConfig();
      throwIfAborted(probeOptions.signal);
      const providers = assertKnownProviders(
        probeOptions.providers ?? runtimeConfig.providerOrder,
      );
      throwIfAborted(probeOptions.signal);

      const results = await Promise.all(
        providers.map(async (provider) => {
          try {
            throwIfAborted(probeOptions.signal);
            const result = await resolveAdapter(provider).healthCheck(
              runtimeConfig.providers[provider],
              {
                signal: probeOptions.signal,
                timeoutMs: probeOptions.timeoutMs ?? runtimeConfig.healthcheckTimeoutMs,
                maxRetries: probeOptions.maxRetries ?? runtimeConfig.maxRetriesPerProvider,
              },
            );
            throwIfAborted(probeOptions.signal);
            return result;
          } catch (error) {
            rethrowIfAborted(probeOptions.signal, error);
            return toHealthFailure(provider, error, runtimeConfig.providers[provider].model);
          }
        }),
      );
      throwIfAborted(probeOptions.signal);

      const unhealthyProviders = results
        .filter((result) => !result.ok)
        .map((result) => result.provider);

      if (unhealthyProviders.length > 0) {
        safeLog(
          "warn",
          "ai provider probes completed with unhealthy providers",
          () => withLogContext(
            {
              providers,
              healthyProviderCount: results.length - unhealthyProviders.length,
              unhealthyProviders,
            },
            probeOptions.logContext,
          ),
        );
      } else {
        safeLog(
          "info",
          "ai provider probes completed successfully",
          () => withLogContext(
            {
              providers,
              healthyProviderCount: results.length - unhealthyProviders.length,
              unhealthyProviders,
            },
            probeOptions.logContext,
          ),
        );
      }

      return results;
    },
  };
};
