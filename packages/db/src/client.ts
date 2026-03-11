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

// ConvexHttpClient#setAdminAuth exists in the installed convex@1.32.0 runtime and source,
// but upstream marks it as @internal and omits it from the published browser typings.
// Keep this local type augmentation isolated here so upgrades that rename or remove the
// method only affect one boundary. If Convex exposes a public admin-auth API later, or a
// future upgrade breaks this adapter, swap the implementation behind createConvexAdminClient.
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
  // This helper intentionally depends on ConvexHttpClient#setAdminAuth from convex@1.32.0.
  // Although the method is available at runtime, it is an upstream @internal API without
  // semver guarantees in the published typings. If a Convex upgrade breaks this path, keep
  // the same factory boundary and replace it with either a new public admin-auth API or a
  // dedicated server-side transport for internal-function calls using the admin key.
  const client = new ConvexHttpClient(url) as AdminCapableConvexHttpClient & ConvexAdminClient;
  client.setAdminAuth(adminKey);
  return client;
};
