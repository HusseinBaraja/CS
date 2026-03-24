import type { PromptHistoryTurn } from '@cs/ai';
import { convexInternal, createConvexAdminClient, type ConvexAdminClient, type Id } from '@cs/db';

export interface ConversationRecord {
  id: string;
  companyId: string;
  phoneNumber: string;
  muted: boolean;
  mutedAt?: number;
}

export interface ConversationMessageRecord {
  id: string;
  conversationId: string;
  role: "user" | "assistant";
  content: string;
  timestamp: number;
}

export interface AppendConversationMessageInput {
  companyId: string;
  conversationId: string;
  content: string;
  timestamp: number;
}

export interface ConversationStore {
  getOrCreateActiveConversation(companyId: string, phoneNumber: string): Promise<ConversationRecord>;
  appendUserMessage(input: AppendConversationMessageInput): Promise<ConversationMessageRecord>;
  appendAssistantMessage(input: AppendConversationMessageInput): Promise<ConversationMessageRecord>;
  getPromptHistory(input: { companyId: string; conversationId: string; limit: number }): Promise<PromptHistoryTurn[]>;
  trimConversationMessages(input: {
    companyId: string;
    conversationId: string;
    maxMessages: number;
  }): Promise<{ deletedCount: number; remainingCount: number }>;
}

export interface ConvexConversationStoreOptions {
  createClient?: () => ConvexAdminClient;
}

const CONVEX_ID_PATTERN = /^[A-Za-z0-9_-]+$/;

const toConvexId = <TableName extends "companies" | "conversations">(
  tableName: TableName,
  rawValue: string,
): Id<TableName> => {
  const normalizedValue = rawValue.trim();
  if (normalizedValue.length === 0 || !CONVEX_ID_PATTERN.test(normalizedValue)) {
    throw new Error(
      `Invalid ${tableName} id "${rawValue}": expected a non-empty identifier containing only letters, numbers, "_" or "-"`,
    );
  }

  return normalizedValue as Id<TableName>;
};

export const toCompanyId = (companyId: string): Id<"companies"> => toConvexId("companies", companyId);

const toConversationId = (conversationId: string): Id<"conversations"> => {
  return toConvexId("conversations", conversationId);
};

export const createConvexConversationStore = (
  options: ConvexConversationStoreOptions = {},
): ConversationStore => {
  const createClient = options.createClient ?? createConvexAdminClient;
  const client = createClient();

  const withClient = async <T>(callback: (client: ConvexAdminClient) => Promise<T>): Promise<T> =>
    callback(client);

  const appendMessage = (
    role: "user" | "assistant",
    input: AppendConversationMessageInput,
  ): Promise<ConversationMessageRecord> =>
    withClient((client) =>
      client.mutation(convexInternal.conversations.appendConversationMessage, {
        companyId: toCompanyId(input.companyId),
        conversationId: toConversationId(input.conversationId),
        role,
        content: input.content,
        timestamp: input.timestamp,
      })
    );

  return {
    appendAssistantMessage: (input) => appendMessage("assistant", input),
    appendUserMessage: (input) => appendMessage("user", input),
    getOrCreateActiveConversation: (companyId, phoneNumber) =>
      withClient((client) =>
        client.action(convexInternal.conversations.getOrCreateActiveConversation, {
          companyId: toCompanyId(companyId),
          phoneNumber,
        })
      ),
    getPromptHistory: (input) =>
      withClient((client) =>
        client.query(convexInternal.conversations.getPromptHistory, {
          companyId: toCompanyId(input.companyId),
          conversationId: toConversationId(input.conversationId),
          limit: input.limit,
        })
      ),
    trimConversationMessages: (input) =>
      withClient((client) =>
        client.mutation(convexInternal.conversations.trimConversationMessages, {
          companyId: toCompanyId(input.companyId),
          conversationId: toConversationId(input.conversationId),
          maxMessages: input.maxMessages,
        })
      ),
  };
};
