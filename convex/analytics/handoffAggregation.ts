import type { Doc } from '../_generated/dataModel';
import type { AnalyticsHandoffSource, AnalyticsHandoffSourceBreakdown } from '@cs/shared';

type AnalyticsEventDoc = Doc<'analyticsEvents'>;

export const createEmptyHandoffSourceBreakdown = (): AnalyticsHandoffSourceBreakdown => ({
  assistant_action: 0,
  provider_failure_fallback: 0,
  invalid_model_output_fallback: 0,
  message_too_long: 0,
  unknown: 0,
});

const getHandoffSourceFromPayload = (payload: AnalyticsEventDoc['payload']): AnalyticsHandoffSource => {
  const value = payload?.source;
  return value === 'assistant_action' ||
    value === 'provider_failure_fallback' ||
    value === 'invalid_model_output_fallback' ||
    value === 'message_too_long'
    ? value
    : 'unknown';
};

export const incrementHandoffCounts = (
  handoffsBySource: AnalyticsHandoffSourceBreakdown,
  payload: AnalyticsEventDoc['payload'],
): void => {
  handoffsBySource[getHandoffSourceFromPayload(payload)] += 1;
};
