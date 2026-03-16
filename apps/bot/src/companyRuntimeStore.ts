import {
  DEFAULT_COMPANY_TIMEZONE,
  type BotRuntimeSessionRecord,
  type CompanyRuntimeProfile,
} from '@cs/shared';
import { convexInternal, createConvexAdminClient, type ConvexAdminClient } from '@cs/db';

export interface CompanyRuntimeStore {
  listEnabledCompanies(): Promise<CompanyRuntimeProfile[]>;
  upsertSession(record: BotRuntimeSessionRecord): Promise<void>;
  releaseSessionsByOwner(runtimeOwnerId: string): Promise<void>;
}

export interface ConvexCompanyRuntimeStoreOptions {
  createClient?: () => ConvexAdminClient;
}

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
    upsertSession: async (record) => {
      await withClient((client) =>
        client.mutation(convexInternal.companyRuntime.upsertBotRuntimeSession, {
          ...record,
          companyId: record.companyId as never,
        })
      );
    },
  };
};
