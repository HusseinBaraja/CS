import { requireEnv } from '@cs/config';
import { ConvexHttpClient } from 'convex/browser';
import type { FunctionReference, FunctionReturnType, OptionalRestArgs } from 'convex/server';
import { api, internal } from '@cs/convex-api';

export { api as convexApi, internal as convexInternal };

export const createConvexClient = (
  url: string = requireEnv("CONVEX_URL"),
): ConvexHttpClient => new ConvexHttpClient(url);

type InternalQueryReference = FunctionReference<"query", "internal">;
type InternalMutationReference = FunctionReference<"mutation", "internal">;
type InternalActionReference = FunctionReference<"action", "internal">;

type AdminCapableConvexHttpClient = ConvexHttpClient & {
  setAdminAuth(token: string): void;
};

export interface ConvexAdminClient {
  query<Query extends InternalQueryReference>(
    query: Query,
    ...args: OptionalRestArgs<Query>
  ): Promise<FunctionReturnType<Query>>;
  mutation<Mutation extends InternalMutationReference>(
    mutation: Mutation,
    ...args: OptionalRestArgs<Mutation>
  ): Promise<FunctionReturnType<Mutation>>;
  action<Action extends InternalActionReference>(
    action: Action,
    ...args: OptionalRestArgs<Action>
  ): Promise<FunctionReturnType<Action>>;
}

export const createConvexAdminClient = (
  url: string = requireEnv("CONVEX_URL"),
  adminKey: string = requireEnv("CONVEX_ADMIN_KEY"),
): ConvexAdminClient => {
  const client = new ConvexHttpClient(url) as AdminCapableConvexHttpClient & ConvexAdminClient;
  client.setAdminAuth(adminKey);
  return client;
};
