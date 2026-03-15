import type { AssistantActionType } from './promptContracts';

export const DEFAULT_ALLOWED_ACTIONS: readonly AssistantActionType[] = ["none", "clarify", "handoff"];

export const getAllowedActions = (
  allowedActions: readonly AssistantActionType[] | undefined,
): readonly AssistantActionType[] => {
  if (!allowedActions || allowedActions.length === 0) {
    return DEFAULT_ALLOWED_ACTIONS;
  }

  return Array.from(new Set(allowedActions));
};
