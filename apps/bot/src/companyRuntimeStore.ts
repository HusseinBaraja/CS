import {
  DEFAULT_COMPANY_TIMEZONE,
  type BotRuntimePairingArtifact,
  type BotRuntimeSessionRecord,
  type CompanyRuntimeProfile,
} from '@cs/shared';
import { convexInternal, createConvexAdminClient, type ConvexAdminClient, type Id } from '@cs/db';

export interface CompanyRuntimeStore {
  listEnabledCompanies(): Promise<CompanyRuntimeProfile[]>;
  upsertSession(record: BotRuntimeSessionRecord): Promise<void>;
  upsertPairingArtifact(record: BotRuntimePairingArtifact): Promise<void>;
  clearSession(companyId: string, runtimeOwnerId: string): Promise<void>;
  clearPairingArtifact(companyId: string, runtimeOwnerId: string): Promise<void>;
  releaseSessionsByOwner(runtimeOwnerId: string): Promise<void>;
  releasePairingArtifactsByOwner(runtimeOwnerId: string): Promise<void>;
}

export interface ConvexCompanyRuntimeStoreOptions {
  createClient?: () => ConvexAdminClient;
}

const MISSING_FUNCTION_PATTERNS = [
  "Could not find public function",
  "Could not find internal function",
  "Did you forget to run `npx convex dev` or `npx convex deploy`?",
] as const;

export const normalizeCompanyRuntimeStoreError = (error: unknown): unknown => {
  if (
    error instanceof Error &&
    MISSING_FUNCTION_PATTERNS.some((pattern) => error.message.includes(pattern))
  ) {
    return new Error(
      "Configured Convex deployment is missing bot runtime backend functions. Sync the backend with `bunx convex dev --once` for the active CONVEX_DEPLOYMENT.",
      { cause: error },
    );
  }

  return error;
};

const toCompanyId = (companyId: string): Id<"companies"> => {
  const normalizedCompanyId = companyId.trim();
  if (normalizedCompanyId.length === 0) {
    throw new Error("Invalid companyId: expected a non-empty Convex identifier");
  }

  return normalizedCompanyId as Id<"companies">;
};

export const createConvexCompanyRuntimeStore = (
  options: ConvexCompanyRuntimeStoreOptions = {},
): CompanyRuntimeStore => {
  const createClient = options.createClient ?? createConvexAdminClient;

  const withClient = async <T>(callback: (client: ConvexAdminClient) => Promise<T>): Promise<T> => {
    try {
      return await callback(createClient());
    } catch (error) {
      throw normalizeCompanyRuntimeStoreError(error);
    }
  };

  return {
    listEnabledCompanies: async () =>
      withClient((client) =>
        client.query(convexInternal.companyRuntime.listEnabledBotCompanies, {})
      ).then((profiles) =>
        profiles.map((profile) => ({
          ...profile,
          timezone: profile.timezone ?? DEFAULT_COMPANY_TIMEZONE,
        }))
      ),
    releaseSessionsByOwner: async (runtimeOwnerId) => {
      await withClient((client) =>
        client.mutation(convexInternal.companyRuntime.releaseBotRuntimeSessionsByOwner, {
          runtimeOwnerId,
        })
      );
    },
    releasePairingArtifactsByOwner: async (runtimeOwnerId) => {
      await withClient((client) =>
        client.mutation(convexInternal.companyRuntime.releaseBotRuntimePairingArtifactsByOwner, {
          runtimeOwnerId,
        })
      );
    },
    upsertSession: async (record) => {
      await withClient((client) =>
        client.mutation(convexInternal.companyRuntime.upsertBotRuntimeSession, {
          ...record,
          companyId: toCompanyId(record.companyId),
        })
      );
    },
    upsertPairingArtifact: async (record) => {
      await withClient((client) =>
        client.mutation(convexInternal.companyRuntime.upsertBotRuntimePairingArtifact, {
          ...record,
          companyId: toCompanyId(record.companyId),
        })
      );
    },
    clearSession: async (companyId, runtimeOwnerId) => {
      await withClient((client) =>
        client.mutation(convexInternal.companyRuntime.clearBotRuntimeSession, {
          companyId: toCompanyId(companyId),
          runtimeOwnerId,
        })
      );
    },
    clearPairingArtifact: async (companyId, runtimeOwnerId) => {
      await withClient((client) =>
        client.mutation(convexInternal.companyRuntime.clearBotRuntimePairingArtifact, {
          companyId: toCompanyId(companyId),
          runtimeOwnerId,
        })
      );
    },
  };
};
