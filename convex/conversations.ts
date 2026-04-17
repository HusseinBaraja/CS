import {
  internalAction,
  internalMutation,
  internalQuery,
} from './_generated/server';
import { AUTO_RESUME_IDLE_MS, STALE_CONTEXT_RESET_MS } from './conversations/constants';
import {
  acquireConversationLockDefinition,
  releaseConversationLockDefinition,
} from './conversations/lock-helpers';
import {
  ensureActiveConversationDefinition,
  getOrCreateActiveConversationDefinition,
  getOrCreateConversationForInboundDefinition,
  appendConversationMessageDefinition,
  appendMutedCustomerMessageDefinition,
  appendInboundCustomerMessageToConversationDefinition,
  appendInboundCustomerMessageDefinition,
} from './conversations/inbound-append-flows';
import {
  getConversationByPhoneDefinition,
  getConversationDefinition,
  getConversationMessageDefinition,
  listConversationMessagesDefinition,
  listDueAutoResumeConversationsDefinition,
  trimConversationMessagesDefinition,
} from './conversations/trimming-list-queries';
import {
  getPromptHistoryDefinition,
  getPromptHistoryForInboundDefinition,
  getPromptHistorySelectionForInboundDefinition,
} from './conversations/prompt-history-selection';
import {
  appendPendingAssistantMessageDefinition,
  acknowledgePendingAssistantMessageDefinition,
  listPendingAssistantMessagesDefinition,
  getConversationOwnerNotificationContextDefinition,
  commitPendingAssistantMessageDefinition,
  markPendingAssistantMessageFailedDefinition,
  completePendingAssistantSideEffectsDefinition,
  recordPendingAssistantSideEffectProgressDefinition,
} from './conversations/pending-assistant-lifecycle';
import {
  appendAssistantMessageAndStartHandoffDefinition,
  startHandoffDefinition,
  resumeConversationDefinition,
  recordMutedCustomerActivityDefinition,
} from './conversations/handoff-resume-flows';

export { AUTO_RESUME_IDLE_MS, STALE_CONTEXT_RESET_MS };

export const acquireConversationLock = internalMutation(acquireConversationLockDefinition);
export const releaseConversationLock = internalMutation(releaseConversationLockDefinition);
export const ensureActiveConversation = internalMutation(ensureActiveConversationDefinition);
export const getOrCreateActiveConversation = internalAction(getOrCreateActiveConversationDefinition);
export const getOrCreateConversationForInbound = internalAction(getOrCreateConversationForInboundDefinition);
export const getConversationByPhone = internalQuery(getConversationByPhoneDefinition);
export const getConversation = internalQuery(getConversationDefinition);
export const appendConversationMessage = internalMutation(appendConversationMessageDefinition);
export const appendMutedCustomerMessage = internalMutation(appendMutedCustomerMessageDefinition);
export const appendInboundCustomerMessageToConversation = internalMutation(
  appendInboundCustomerMessageToConversationDefinition,
);
export const appendInboundCustomerMessage = internalAction(appendInboundCustomerMessageDefinition);
export const getConversationMessage = internalQuery(getConversationMessageDefinition);
export const appendPendingAssistantMessage = internalMutation(appendPendingAssistantMessageDefinition);
export const acknowledgePendingAssistantMessage = internalMutation(acknowledgePendingAssistantMessageDefinition);
export const listPendingAssistantMessages = internalQuery(listPendingAssistantMessagesDefinition);
export const getConversationOwnerNotificationContext = internalQuery(
  getConversationOwnerNotificationContextDefinition,
);
export const commitPendingAssistantMessage = internalMutation(commitPendingAssistantMessageDefinition);
export const markPendingAssistantMessageFailed = internalMutation(markPendingAssistantMessageFailedDefinition);
export const completePendingAssistantSideEffects = internalMutation(
  completePendingAssistantSideEffectsDefinition,
);
export const recordPendingAssistantSideEffectProgress = internalMutation(
  recordPendingAssistantSideEffectProgressDefinition,
);
export const appendAssistantMessageAndStartHandoff = internalMutation(
  appendAssistantMessageAndStartHandoffDefinition,
);
export const listConversationMessages = internalQuery(listConversationMessagesDefinition);
export const listDueAutoResumeConversations = internalQuery(listDueAutoResumeConversationsDefinition);
export const getPromptHistory = internalQuery(getPromptHistoryDefinition);
export const getPromptHistoryForInbound = internalQuery(getPromptHistoryForInboundDefinition);
export const getPromptHistorySelectionForInbound = internalQuery(getPromptHistorySelectionForInboundDefinition);
export const trimConversationMessages = internalMutation(trimConversationMessagesDefinition);
export const startHandoff = internalMutation(startHandoffDefinition);
export const resumeConversation = internalMutation(resumeConversationDefinition);
export const recordMutedCustomerActivity = internalMutation(recordMutedCustomerActivityDefinition);
