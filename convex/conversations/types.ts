import type { PromptHistoryTurn } from '@cs/ai';
import type {
  ConversationStateEventSource,
} from '@cs/shared';
import type { Id } from '../_generated/dataModel';

export type LockAcquireResult = {
  acquired: boolean;
  waitMs: number;
};

export type TrimConversationMessagesResult = {
  deletedCount: number;
  remainingCount: number;
};

export type AppendInboundCustomerMessageResult = {
  conversation: import('@cs/shared').ConversationStateDto;
  wasMuted: boolean;
  wasDuplicate: boolean;
};

export type PromptHistorySelectionReason =
  | 'recent_window'
  | 'quoted_reply_slice'
  | 'empty';

export type PromptHistorySelectionResult = {
  history: PromptHistoryTurn[];
  historySelection: {
    reason: PromptHistorySelectionReason;
    quotedMessage?: PromptHistoryTurn;
  };
};

export type AssistantHandoffSource = Extract<
  ConversationStateEventSource,
  'assistant_action' | 'provider_failure_fallback' | 'invalid_model_output_fallback'
>;

export type PendingAssistantMessageCandidate = {
  messageId: Id<'messages'>;
  conversationId: Id<'conversations'>;
  companyId: Id<'companies'>;
  phoneNumber: string;
  timestamp: number;
  transportMessageId?: string;
  analyticsState?: 'pending' | 'recorded' | 'completed' | 'not_applicable';
  ownerNotificationState?: 'pending' | 'sent' | 'completed' | 'not_applicable';
};
