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

const toCompanyId = (companyId: string): Id<"companies"> => {
  const normalizedCompanyId = companyId.trim();
  if (normalizedCompanyId.length === 0) {
    throw new Error("Invalid companyId: expected a non-empty Convex identifier");
  }

  return normalizedCompanyId as Id<"companies">;
};

const toConversationId = (conversationId: string): Id<"conversations"> => {
  const normalizedConversationId = conversationId.trim();
  if (normalizedConversationId.length === 0) {
    throw new Error("Invalid conversationId: expected a non-empty Convex identifier");
  }

  return normalizedConversationId as Id<"conversations">;
};

export const createConvexConversationStore = (
  options: ConvexConversationStoreOptions = {},
): ConversationStore => {
  const createClient = options.createClient ?? createConvexAdminClient;

  const withClient = async <T>(callback: (client: ConvexAdminClient) => Promise<T>): Promise<T> =>
    callback(createClient());

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
