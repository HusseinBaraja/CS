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
  clearPairingArtifact(companyId: string): Promise<void>;
  releaseSessionsByOwner(runtimeOwnerId: string): Promise<void>;
  releasePairingArtifactsByOwner(runtimeOwnerId: string): Promise<void>;
}

export interface ConvexCompanyRuntimeStoreOptions {
  createClient?: () => ConvexAdminClient;
}

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

  const withClient = async <T>(callback: (client: ConvexAdminClient) => Promise<T>): Promise<T> =>
    callback(createClient());

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
    clearPairingArtifact: async (companyId) => {
      await withClient((client) =>
        client.mutation(convexInternal.companyRuntime.clearBotRuntimePairingArtifact, {
          companyId: toCompanyId(companyId),
        })
      );
    },
  };
};
