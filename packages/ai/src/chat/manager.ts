import { AIError, ERROR_CODES } from '@cs/shared';
import {
  logEvent,
  serializeErrorForLog,
  type StructuredLogPayloadInput,
  type StructuredLogger,
  withLogBindings,
} from '@cs/core';
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
import { getChatProviderOrderForRequest } from './providerOrder';
import {
  type ChatRuntimeConfig,
  createChatRuntimeConfig,
  createRetrievalRewriteRuntimeConfig,
  type RetrievalRewriteRuntimeConfig,
} from './runtimeConfig';

export type ChatManagerLogger = StructuredLogger;

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
  logger?: ChatManagerLogger;
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
  logger?: ChatManagerLogger;
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

export interface CreateRetrievalRewriteChatProviderManagerOptions
  extends Omit<CreateChatProviderManagerOptions, "runtimeConfig"> {
  runtimeConfig?: RetrievalRewriteRuntimeConfig | (() => RetrievalRewriteRuntimeConfig);
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

const toLogBindings = (
  logContext: ChatManagerLogContext | undefined,
): Record<string, unknown> => ({
  ...(logContext?.companyId ? { companyId: logContext.companyId } : {}),
  ...(logContext?.conversationId ? { conversationId: logContext.conversationId } : {}),
  ...(logContext?.requestId ? { requestId: logContext.requestId } : {}),
  ...(logContext?.feature ? { feature: logContext.feature } : {}),
});

const createEventLogger = (
  baseLogger: ChatManagerLogger | undefined,
  overrideLogger: ChatManagerLogger | undefined,
  surface: "chat" | "probe",
  logContext: ChatManagerLogContext | undefined,
): ChatManagerLogger | undefined => {
  const activeLogger = overrideLogger ?? baseLogger;
  if (!activeLogger) {
    return undefined;
  }

  return withLogBindings(activeLogger, {
    runtime: "ai",
    surface,
    ...toLogBindings(logContext),
  });
};

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
    eventLogger: ChatManagerLogger | undefined,
    level: "info" | "warn" | "error",
    message: string,
    buildPayload: () => StructuredLogPayloadInput,
  ): void => {
    if (!eventLogger) {
      return;
    }

    try {
      logEvent(eventLogger, level, buildPayload(), message);
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
      const providerOrder = getChatProviderOrderForRequest(runtimeConfig, normalizedRequest);
      const eventLogger = createEventLogger(
        logger,
        callOptions.logger,
        "chat",
        callOptions.logContext,
      );

      const startedAt = Date.now();
      const failures: ChatProviderAttemptFailure[] = [];
      for (const [index, provider] of providerOrder.entries()) {
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
            eventLogger,
            "info",
            "ai provider request completed",
            () => ({
              event: "ai.provider.request_completed",
              outcome: "success",
              provider,
              model: response.model ?? providerConfig.model,
              durationMs: Date.now() - startedAt,
              failoverOccurred: failures.length > 0,
              attemptedProviders: [...failures.map((failure) => failure.provider), provider],
              ...(response.usage ? { usage: response.usage } : {}),
            }),
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

          const nextProvider = providerOrder[index + 1];
          const willFailOver =
            providerError.disposition !== "do_not_retry" && nextProvider !== undefined;

          safeLog(
            eventLogger,
            willFailOver ? "warn" : "error",
            "ai provider attempt failed",
            () => ({
              event: "ai.provider.attempt_failed",
              outcome: willFailOver ? "retrying" : "failed",
              provider,
              model: failure.model,
              errorKind: failure.kind,
              disposition: failure.disposition,
              ...(failure.statusCode !== undefined
                ? { statusCode: failure.statusCode }
                : {}),
              ...(nextProvider !== undefined ? { nextProvider } : {}),
              error: serializeErrorForLog(providerError),
            }),
          );

          if (willFailOver) {
            safeLog(
              eventLogger,
              "warn",
              "ai provider failover selected",
              () => ({
                event: "ai.provider.failover",
                outcome: "failover",
                provider,
                model: failure.model,
                nextProvider,
                attemptedProviders: failures.map((attemptFailure) => attemptFailure.provider),
              }),
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
            eventLogger,
            "error",
            "ai provider chain failed",
            () => ({
              event: "ai.provider.chain_failed",
              outcome: chainError.terminalDisposition,
              attemptedProviders: chainError.attemptedProviders,
              failures: chainError.failures,
              ...(chainError.terminalProvider !== undefined
                ? { terminalProvider: chainError.terminalProvider }
                : {}),
              terminalDisposition: chainError.terminalDisposition,
              error: serializeErrorForLog(providerError),
            }),
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
      const eventLogger = createEventLogger(
        logger,
        probeOptions.logger,
        "probe",
        probeOptions.logContext,
      );
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
          eventLogger,
          "warn",
          "ai provider probes completed",
          () => ({
            event: "ai.provider.probe_completed",
            outcome: "degraded",
            providers,
            healthyProviderCount: results.length - unhealthyProviders.length,
            unhealthyProviders,
          }),
        );
      } else {
        safeLog(
          eventLogger,
          "info",
          "ai provider probes completed",
          () => ({
            event: "ai.provider.probe_completed",
            outcome: "healthy",
            providers,
            healthyProviderCount: results.length - unhealthyProviders.length,
            unhealthyProviders,
          }),
        );
      }

      return results;
    },
  };
};

export const createRetrievalRewriteChatProviderManager = (
  options: CreateRetrievalRewriteChatProviderManagerOptions = {},
): ChatProviderManager =>
  createChatProviderManager({
    ...options,
    runtimeConfig: options.runtimeConfig ?? createRetrievalRewriteRuntimeConfig,
  });
