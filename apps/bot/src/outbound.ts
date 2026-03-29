import {
  createR2Storage,
  type ObjectStorage,
  PRODUCT_IMAGE_DOWNLOAD_EXPIRY_SECONDS,
} from '@cs/storage';
import {
  logEvent,
  redactJidForLog,
  serializeErrorForLog,
  type StructuredLogger,
  withLogBindings,
} from '@cs/core';
import {
  renderOutboundText,
  type RenderOutboundTextInput,
} from '@cs/shared';

export type OutboundTextValue = string | RenderOutboundTextInput;
export type OutboundTypingPolicy = "off" | "auto" | number;
export type OutboundFailureClassification =
  | "validation"
  | "media_resolution"
  | "retryable_transport"
  | "non_retryable_transport"
  | "unknown";

export type OutboundLogger = StructuredLogger;

export interface OutboundTimer {
  setTimeout(handler: () => void, delayMs: number): unknown;
  clearTimeout(timeoutId: unknown): void;
}

export interface OutboundTransport {
  sendMessage(recipientJid: string, message: OutboundTransportMessage): Promise<unknown>;
  presenceSubscribe(recipientJid: string): Promise<void>;
  sendPresenceUpdate(state: "composing" | "paused", recipientJid: string): Promise<void>;
}

export interface OutboundSendReceipt {
  attempts: number;
  kind: "text" | "image" | "document";
  messageId?: string;
  recipientJid: string;
  stepIndex: number;
}

export interface OutboundSequenceErrorDetails {
  attempts: number;
  cause?: unknown;
  classification: OutboundFailureClassification;
  recipientJid: string;
  sentReceipts: OutboundSendReceipt[];
  stepIndex: number;
}

export interface OutboundStepPacing {
  delayBeforeMs?: number;
  typing?: OutboundTypingPolicy;
}

export type OutboundMediaSource =
  | {
    type: "storage_key";
    key: string;
  }
  | {
    type: "url";
    url: string;
  };

export type OutboundSequenceStep = OutboundTextStep | OutboundImageStep | OutboundDocumentStep;

export interface OutboundTextStep {
  kind: "text";
  text: OutboundTextValue;
  pacing?: OutboundStepPacing;
}

export interface OutboundImageStep {
  kind: "image";
  media: OutboundMediaSource;
  caption?: OutboundTextValue;
  mimeType?: string;
  pacing?: OutboundStepPacing;
}

export interface OutboundDocumentStep {
  kind: "document";
  media: OutboundMediaSource;
  caption?: OutboundTextValue;
  fileName?: string;
  mimeType?: string;
  pacing?: OutboundStepPacing;
}

export interface SendTextInput {
  recipientJid: string;
  text: OutboundTextValue;
  pacing?: OutboundStepPacing;
  logger?: OutboundLogger;
}

export interface SendMediaInput {
  recipientJid: string;
  step: OutboundImageStep | OutboundDocumentStep;
  logger?: OutboundLogger;
}

export interface SendSequenceInput {
  recipientJid: string;
  steps: readonly OutboundSequenceStep[];
  betweenStepsDelayMs?: number;
  logger?: OutboundLogger;
}

export interface OutboundMessenger {
  sendText(input: SendTextInput): Promise<OutboundSendReceipt[]>;
  sendMedia(input: SendMediaInput): Promise<OutboundSendReceipt[]>;
  sendSequence(input: SendSequenceInput): Promise<OutboundSendReceipt[]>;
}

export interface CreateOutboundMessengerOptions {
  createStorage?: () => ObjectStorage;
  logger?: OutboundLogger;
  timer?: OutboundTimer;
  transport: OutboundTransport;
}

type OutboundTransportMessage =
  | {
    text: string;
  }
  | {
    image: { url: string };
    caption?: string;
    mimetype?: string;
  }
  | {
    document: { url: string };
    caption?: string;
    fileName?: string;
    mimetype?: string;
  };

interface OutboundClassificationResult {
  classification: OutboundFailureClassification;
  retryable: boolean;
  code?: string;
  statusCode?: number;
}

const RETRYABLE_STATUS_CODES = new Set([408, 428, 429, 500, 503]);
const RETRYABLE_ERROR_CODES = new Set(["ETIMEDOUT", "ECONNRESET", "EAI_AGAIN"]);
const AUTO_TYPING_MIN_MS = 600;
const AUTO_TYPING_MAX_MS = 2_500;
const CAPTIONLESS_MEDIA_TYPING_MS = 900;
const RETRY_BASE_DELAY_MS = 500;
const MAX_SEND_ATTEMPTS = 2;

const defaultTimer: OutboundTimer = {
  setTimeout: (handler, delayMs) => globalThis.setTimeout(handler, delayMs),
  clearTimeout: (timeoutId) =>
    globalThis.clearTimeout(timeoutId as ReturnType<typeof globalThis.setTimeout>),
};

const defaultLogger: OutboundLogger = {
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
};

const sleep = async (timer: OutboundTimer, delayMs: number): Promise<void> => {
  await new Promise<void>((resolve) => {
    timer.setTimeout(resolve, delayMs);
  });
};

const normalizeDelayMs = (value: number | undefined, fieldName: string): number => {
  if (value === undefined) {
    return 0;
  }

  if (!Number.isInteger(value) || value < 0) {
    throw new OutboundValidationError(`${fieldName} must be a non-negative integer`);
  }

  return value;
};

const trimOptionalString = (value: string | undefined, fieldName: string): string | undefined => {
  if (value === undefined) {
    return undefined;
  }

  const normalized = value.trim();
  if (normalized.length === 0) {
    throw new OutboundValidationError(`${fieldName} must be a non-empty string when provided`);
  }

  return normalized;
};

const renderOptionalText = (value: OutboundTextValue | undefined): string | undefined => {
  if (value === undefined) {
    return undefined;
  }

  const rendered = typeof value === "string"
    ? renderOutboundText({ sections: [value] })
    : renderOutboundText(value);

  return rendered.length > 0 ? rendered : undefined;
};

const renderRequiredText = (value: OutboundTextValue, fieldName: string): string => {
  const rendered = renderOptionalText(value);
  if (!rendered) {
    throw new OutboundValidationError(`${fieldName} must render to a non-empty message`);
  }

  return rendered;
};

const readString = (value: unknown): string | undefined =>
  typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;

const readNumber = (value: unknown): number | undefined =>
  typeof value === "number" && Number.isFinite(value) ? value : undefined;

const extractStatusCode = (error: unknown): number | undefined => {
  if (!error || typeof error !== "object") {
    return undefined;
  }

  const candidate = error as {
    output?: { statusCode?: unknown };
    data?: { statusCode?: unknown };
    status?: unknown;
    statusCode?: unknown;
  };

  return [
    candidate.output?.statusCode,
    candidate.data?.statusCode,
    candidate.statusCode,
    candidate.status,
  ]
    .map(readNumber)
    .find((value): value is number => value !== undefined);
};

const extractErrorCode = (error: unknown): string | undefined => {
  if (!error || typeof error !== "object") {
    return undefined;
  }

  return readString((error as { code?: unknown }).code);
};

const extractMessageId = (result: unknown): string | undefined => {
  if (!result || typeof result !== "object") {
    return undefined;
  }

  return readString((result as { key?: { id?: unknown } }).key?.id);
};

const resolveMediaUrl = async (
  storage: ObjectStorage,
  media: OutboundMediaSource,
): Promise<string> => {
  if (media.type === "url") {
    const normalizedUrl = trimOptionalString(media.url, "media.url");
    if (!normalizedUrl) {
      throw new OutboundValidationError("media.url must be a non-empty string");
    }

    return normalizedUrl;
  }

  const normalizedKey = trimOptionalString(media.key, "media.key");
  if (!normalizedKey) {
    throw new OutboundValidationError("media.key must be a non-empty string");
  }

  try {
    const download = await storage.createPresignedDownload({
      key: normalizedKey,
      expiresIn: PRODUCT_IMAGE_DOWNLOAD_EXPIRY_SECONDS,
    });

    return download.url;
  } catch (error) {
    throw new OutboundMediaResolutionError("Failed to resolve outbound media URL", {
      cause: error,
    });
  }
};

const buildTransportMessage = async (
  storage: ObjectStorage,
  step: OutboundSequenceStep,
): Promise<{ kind: OutboundSendReceipt["kind"]; message: OutboundTransportMessage; renderedText?: string }> => {
  if (step.kind === "text") {
    const text = renderRequiredText(step.text, "text");
    return {
      kind: "text",
      message: {
        text,
      },
      renderedText: text,
    };
  }

  const caption = renderOptionalText(step.caption);
  const url = await resolveMediaUrl(storage, step.media);
  const mimetype = trimOptionalString(step.mimeType, "mimeType");

  if (step.kind === "image") {
    return {
      kind: "image",
      message: {
        image: { url },
        ...(caption ? { caption } : {}),
        ...(mimetype ? { mimetype } : {}),
      },
      renderedText: caption,
    };
  }

  const fileName = trimOptionalString(step.fileName, "fileName");
  return {
    kind: "document",
    message: {
      document: { url },
      ...(caption ? { caption } : {}),
      ...(fileName ? { fileName } : {}),
      ...(mimetype ? { mimetype } : {}),
    },
    renderedText: caption,
  };
};

export const computeTypingDurationMs = (
  input: {
    text?: string;
    typing?: OutboundTypingPolicy;
  },
): number => {
  if (input.typing === undefined || input.typing === "off") {
    return 0;
  }

  if (typeof input.typing === "number") {
    return normalizeDelayMs(input.typing, "typing");
  }

  const normalizedText = input.text?.trim() ?? "";
  if (normalizedText.length === 0) {
    return CAPTIONLESS_MEDIA_TYPING_MS;
  }

  return Math.min(
    AUTO_TYPING_MAX_MS,
    Math.max(AUTO_TYPING_MIN_MS, normalizedText.length * 35),
  );
};

export class OutboundValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OutboundValidationError";
  }
}

export class OutboundMediaResolutionError extends Error {
  constructor(message: string, options: { cause?: unknown } = {}) {
    super(message);
    this.name = "OutboundMediaResolutionError";
    if (options.cause !== undefined) {
      Object.defineProperty(this, "cause", {
        configurable: true,
        enumerable: false,
        value: options.cause,
        writable: true,
      });
    }
  }
}

export class OutboundTransportUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OutboundTransportUnavailableError";
  }
}

export class OutboundSequenceError extends Error {
  readonly attempts: number;
  readonly classification: OutboundFailureClassification;
  readonly recipientJid: string;
  readonly sentReceipts: OutboundSendReceipt[];
  readonly stepIndex: number;

  constructor(message: string, details: OutboundSequenceErrorDetails) {
    super(message);
    this.name = "OutboundSequenceError";
    this.attempts = details.attempts;
    this.classification = details.classification;
    this.recipientJid = details.recipientJid;
    this.sentReceipts = details.sentReceipts;
    this.stepIndex = details.stepIndex;

    if (details.cause !== undefined) {
      Object.defineProperty(this, "cause", {
        configurable: true,
        enumerable: false,
        value: details.cause,
        writable: true,
      });
    }
  }
}

export const classifyOutboundError = (error: unknown): OutboundClassificationResult => {
  if (error instanceof OutboundValidationError) {
    return {
      classification: "validation",
      retryable: false,
    };
  }

  if (error instanceof OutboundMediaResolutionError) {
    return {
      classification: "media_resolution",
      retryable: false,
    };
  }

  if (error instanceof OutboundTransportUnavailableError) {
    return {
      classification: "non_retryable_transport",
      retryable: false,
    };
  }

  const statusCode = extractStatusCode(error);
  if (statusCode !== undefined) {
    return {
      classification: RETRYABLE_STATUS_CODES.has(statusCode)
        ? "retryable_transport"
        : "non_retryable_transport",
      retryable: RETRYABLE_STATUS_CODES.has(statusCode),
      statusCode,
    };
  }

  const code = extractErrorCode(error);
  if (code) {
    return {
      classification: RETRYABLE_ERROR_CODES.has(code)
        ? "retryable_transport"
        : "non_retryable_transport",
      retryable: RETRYABLE_ERROR_CODES.has(code),
      code,
    };
  }

  return {
    classification: "unknown",
    retryable: false,
  };
};

export const createOutboundMessenger = (
  options: CreateOutboundMessengerOptions,
): OutboundMessenger => {
  const createStorage = options.createStorage ?? createR2Storage;
  const logger = withLogBindings(options.logger ?? defaultLogger, {
    runtime: "bot",
    surface: "outbound",
  });
  const timer = options.timer ?? defaultTimer;
  let storage: ObjectStorage | undefined;

  const getStorage = (): ObjectStorage => {
    storage ??= createStorage();
    return storage;
  };

  const runTypingIndicator = async (
    recipientJid: string,
    renderedText: string | undefined,
    typing: OutboundTypingPolicy | undefined,
  ): Promise<void> => {
    const typingDurationMs = computeTypingDurationMs({
      text: renderedText,
      typing,
    });
    if (typingDurationMs === 0) {
      return;
    }

    await options.transport.presenceSubscribe(recipientJid);
    await options.transport.sendPresenceUpdate("composing", recipientJid);

    try {
      await sleep(timer, typingDurationMs);
    } finally {
      await options.transport.sendPresenceUpdate("paused", recipientJid);
    }
  };

  const sendStep = async (
    recipientJid: string,
    step: OutboundSequenceStep,
    stepIndex: number,
    sentReceipts: OutboundSendReceipt[],
  ): Promise<OutboundSendReceipt> => {
    let kind: OutboundSendReceipt["kind"];
    let message: OutboundTransportMessage;
    try {
      const delayBeforeMs = normalizeDelayMs(step.pacing?.delayBeforeMs, "delayBeforeMs");
      if (delayBeforeMs > 0) {
        await sleep(timer, delayBeforeMs);
      }

      const builtMessage = await buildTransportMessage(getStorage(), step);
      kind = builtMessage.kind;
      message = builtMessage.message;
      await runTypingIndicator(recipientJid, builtMessage.renderedText, step.pacing?.typing);
    } catch (error) {
      if (error instanceof OutboundSequenceError) {
        throw error;
      }

      const classification = classifyOutboundError(error);
      throw new OutboundSequenceError("Failed to send outbound sequence step", {
        attempts: 1,
        cause: error,
        classification: classification.classification,
        recipientJid,
        sentReceipts,
        stepIndex,
      });
    }

    let attempt = 0;
    let lastError: unknown;
    while (attempt < MAX_SEND_ATTEMPTS) {
      attempt += 1;
      try {
        const result = await options.transport.sendMessage(recipientJid, message);
        const messageId = extractMessageId(result);
        return {
          attempts: attempt,
          kind,
          ...(messageId ? { messageId } : {}),
          recipientJid,
          stepIndex,
        };
      } catch (error) {
        lastError = error;
        const classification = classifyOutboundError(error);
        if (!classification.retryable || attempt >= MAX_SEND_ATTEMPTS) {
          throw new OutboundSequenceError("Failed to send outbound sequence step", {
            attempts: attempt,
            cause: error,
            classification: classification.classification,
            recipientJid,
            sentReceipts,
            stepIndex,
          });
        }

        await sleep(timer, RETRY_BASE_DELAY_MS * 2 ** (attempt - 1));
      }
    }

    // Defensive fallback: the retry loop should have thrown once attempts were exhausted.
    throw new OutboundSequenceError("Failed to send outbound sequence step", {
      attempts: MAX_SEND_ATTEMPTS,
      cause: lastError,
      classification: "unknown",
      recipientJid,
      sentReceipts,
      stepIndex,
    });
  };

  return {
    sendText: async (input): Promise<OutboundSendReceipt[]> => {
      return sendSequence({
        ...(input.logger ? { logger: input.logger } : {}),
        recipientJid: input.recipientJid,
        steps: [
          {
            kind: "text",
            text: input.text,
            ...(input.pacing ? { pacing: input.pacing } : {}),
          },
        ],
      });
    },
    sendMedia: async (input): Promise<OutboundSendReceipt[]> => {
      return sendSequence({
        ...(input.logger ? { logger: input.logger } : {}),
        recipientJid: input.recipientJid,
        steps: [input.step],
      });
    },
    sendSequence,
  };

  async function sendSequence(input: SendSequenceInput): Promise<OutboundSendReceipt[]> {
    if (input.steps.length === 0) {
      throw new OutboundValidationError("steps must contain at least one outbound message");
    }

    const sequenceLogger = withLogBindings(input.logger ?? logger, {
      runtime: "bot",
      surface: "outbound",
    });
    const startedAt = Date.now();
    const betweenStepsDelayMs = normalizeDelayMs(input.betweenStepsDelayMs, "betweenStepsDelayMs");
    const sentReceipts: OutboundSendReceipt[] = [];

    for (const [stepIndex, step] of input.steps.entries()) {
      try {
        const receipt = await sendStep(input.recipientJid, step, stepIndex, [...sentReceipts]);
        sentReceipts.push(receipt);
      } catch (error) {
        if (error instanceof OutboundSequenceError) {
          logEvent(
            sequenceLogger,
            "error",
            {
              event: "bot.outbound.sequence_failed",
              runtime: "bot",
              surface: "outbound",
              outcome: "failed",
              attempts: error.attempts,
              classification: error.classification,
              durationMs: Date.now() - startedAt,
              error: serializeErrorForLog(error.cause ?? error),
              recipientJid: redactJidForLog(error.recipientJid),
              sentCount: error.sentReceipts.length,
              stepCount: input.steps.length,
              stepIndex: error.stepIndex,
            },
            "outbound sequence send failed",
          );
        }

        throw error;
      }

      if (betweenStepsDelayMs > 0 && stepIndex < input.steps.length - 1) {
        await sleep(timer, betweenStepsDelayMs);
      }
    }

    logEvent(
      sequenceLogger,
      "info",
      {
        attempts: sentReceipts.reduce((total, receipt) => total + receipt.attempts, 0),
        durationMs: Date.now() - startedAt,
        event: "bot.outbound.sequence_completed",
        outcome: "success",
        recipientJid: redactJidForLog(input.recipientJid),
        runtime: "bot",
        sentCount: sentReceipts.length,
        stepCount: input.steps.length,
        surface: "outbound",
      },
      "outbound sequence completed",
    );

    return sentReceipts;
  }
};
