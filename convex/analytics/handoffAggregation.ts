import type { Doc } from '../_generated/dataModel';
import {
  ANALYTICS_HANDOFF_SOURCES,
  isValidHandoffSource,
  type AnalyticsHandoffSource,
  type AnalyticsHandoffSourceBreakdown,
} from '@cs/shared';

type AnalyticsEventDoc = Doc<'analyticsEvents'>;

export const createEmptyHandoffSourceBreakdown = (): AnalyticsHandoffSourceBreakdown =>
  Object.fromEntries(ANALYTICS_HANDOFF_SOURCES.map((source) => [source, 0])) as AnalyticsHandoffSourceBreakdown;

const getHandoffSourceFromPayload = (payload: AnalyticsEventDoc['payload']): AnalyticsHandoffSource => {
  const value = payload?.source;
  return typeof value === 'string' && isValidHandoffSource(value) ? value : 'unknown';
};

export const incrementHandoffCounts = (
  handoffsBySource: AnalyticsHandoffSourceBreakdown,
  payload: AnalyticsEventDoc['payload'],
): void => {
  handoffsBySource[getHandoffSourceFromPayload(payload)] += 1;
};
