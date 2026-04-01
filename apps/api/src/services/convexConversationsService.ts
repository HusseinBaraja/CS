import { type ConvexAdminClient, convexInternal, createConvexAdminClient } from '@cs/db';
import { ERROR_CODES } from '@cs/shared';
import {
  type ConversationRecordDto,
  type ConversationsService,
  ConversationsServiceError,
  type HandoffConversationInput,
  type ResumeConversationInput,
  createDatabaseServiceError,
  createNotFoundServiceError,
  createValidationServiceError,
} from './conversations';

export interface ConvexConversationsServiceOptions {
  createClient?: () => ConvexAdminClient;
  now?: () => number;
}

const ERROR_PREFIXES = new Map<string, (message: string) => ConversationsServiceError>([
  [ERROR_CODES.NOT_FOUND, createNotFoundServiceError],
  [ERROR_CODES.VALIDATION_FAILED, createValidationServiceError],
]);

const parseTaggedError = (message: string): ConversationsServiceError | null => {
  for (const [code, createError] of ERROR_PREFIXES) {
    const marker = `${code}:`;
    const markerIndex = message.indexOf(marker);
    if (markerIndex >= 0) {
      const errorMessage = message.slice(markerIndex + marker.length).trim() || "Request failed";
      return createError(errorMessage);
    }
  }

  return null;
};

const isConversationsServiceError = (error: unknown): error is ConversationsServiceError =>
  error instanceof ConversationsServiceError;

const normalizeServiceError = (error: unknown): ConversationsServiceError => {
  if (isConversationsServiceError(error)) {
    return error;
  }

  if (error instanceof Error) {
    const taggedError = parseTaggedError(error.message);
    if (taggedError) {
      return taggedError;
    }

    if (
      error.message.includes("ArgumentValidationError") ||
      error.message.includes("Value does not match validator") ||
      error.message.includes("Invalid argument") ||
      error.message.includes("Unable to decode")
    ) {
      return createValidationServiceError("Invalid company identifier or phone number");
    }
  }

  return createDatabaseServiceError("Conversation state is temporarily unavailable");
};

const normalizeReason = (reason: string | undefined): string | undefined => {
  if (reason === undefined) {
    return undefined;
  }

  const normalized = reason.trim();
  return normalized.length > 0 ? normalized : undefined;
};

export const createConvexConversationsService = (
  options: ConvexConversationsServiceOptions = {},
): ConversationsService => {
  const createClient = options.createClient ?? createConvexAdminClient;
  const now = options.now ?? Date.now;

  const withClient = async <T>(callback: (client: ConvexAdminClient) => Promise<T>): Promise<T> => {
    try {
      return await callback(createClient());
    } catch (error) {
      throw normalizeServiceError(error);
    }
  };

  const findConversation = (
    client: ConvexAdminClient,
    companyId: string,
    phoneNumber: string,
  ): Promise<ConversationRecordDto | null> =>
    client.query(convexInternal.conversations.getConversationByPhone, {
      companyId: companyId as never,
      phoneNumber,
    }) as Promise<ConversationRecordDto | null>;

  const handoffConversation = async (
    client: ConvexAdminClient,
    input: HandoffConversationInput,
  ): Promise<ConversationRecordDto | null> => {
    const conversation = await findConversation(client, input.companyId, input.phoneNumber);
    if (!conversation) {
      return null;
    }

    if (conversation.muted) {
      return conversation;
    }

    return client.mutation(convexInternal.conversations.startHandoff, {
      companyId: input.companyId as never,
      conversationId: conversation.id as never,
      triggerTimestamp: now(),
      source: "api_manual",
      ...(normalizeReason(input.reason) ? { reason: normalizeReason(input.reason) } : {}),
      metadata: { initiatedBy: "api" },
    }) as Promise<ConversationRecordDto>;
  };

  const resumeConversation = async (
    client: ConvexAdminClient,
    input: ResumeConversationInput,
  ): Promise<ConversationRecordDto | null> => {
    const conversation = await findConversation(client, input.companyId, input.phoneNumber);
    if (!conversation) {
      return null;
    }

    if (!conversation.muted) {
      return conversation;
    }

    return client.mutation(convexInternal.conversations.resumeConversation, {
      companyId: input.companyId as never,
      conversationId: conversation.id as never,
      resumedAt: now(),
      source: "api_manual",
      ...(normalizeReason(input.reason) ? { reason: normalizeReason(input.reason) } : {}),
      metadata: { initiatedBy: "api" },
    }) as Promise<ConversationRecordDto>;
  };

  return {
    handoffConversation: (input) => withClient((client) => handoffConversation(client, input)),
    resumeConversation: (input) => withClient((client) => resumeConversation(client, input)),
  };
};
