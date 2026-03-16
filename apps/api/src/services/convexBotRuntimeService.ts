import { type ConvexAdminClient, convexInternal, createConvexAdminClient } from '@cs/db';
import {
  type BotRuntimeOperatorSnapshot,
  type BotRuntimeService,
  BotRuntimeServiceError,
  createDatabaseServiceError,
} from './botRuntime';

export interface ConvexBotRuntimeServiceOptions {
  createClient?: () => ConvexAdminClient;
  now?: () => number;
}

const isBotRuntimeServiceError = (error: unknown): error is BotRuntimeServiceError =>
  error instanceof BotRuntimeServiceError;

const normalizeServiceError = (error: unknown): BotRuntimeServiceError => {
  if (isBotRuntimeServiceError(error)) {
    return error;
  }

  return createDatabaseServiceError(error);
};

export const createConvexBotRuntimeService = (
  options: ConvexBotRuntimeServiceOptions = {},
): BotRuntimeService => {
  const createClient = options.createClient ?? createConvexAdminClient;
  const now = options.now ?? Date.now;

  const withClient = async <T>(callback: (client: ConvexAdminClient) => Promise<T>): Promise<T> => {
    try {
      return await callback(createClient());
    } catch (error) {
      throw normalizeServiceError(error);
    }
  };

  return {
    listOperatorSnapshots: () =>
      withClient((client) =>
        client.query(convexInternal.companyRuntime.listBotRuntimeOperatorSnapshots, {
          now: now(),
        })
      ) as Promise<BotRuntimeOperatorSnapshot[]>,
  };
};
