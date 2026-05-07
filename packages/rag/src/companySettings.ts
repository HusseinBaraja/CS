import {
  convexInternal,
  createConvexAdminClient,
  type ConvexAdminClient,
  type Id,
} from '@cs/db';

export type MissingPricePolicy = 'reply_unavailable' | 'handoff';

export interface CompanySettings {
  missingPricePolicy: MissingPricePolicy;
}

export interface CompanySettingsService {
  getSettings(companyId: Id<'companies'>): Promise<CompanySettings>;
}

export interface CompanySettingsServiceOptions {
  createClient?: () => ConvexAdminClient;
}

const DEFAULT_SETTINGS: CompanySettings = {
  missingPricePolicy: 'reply_unavailable',
};

export const createCompanySettingsService = (
  options: CompanySettingsServiceOptions = {},
): CompanySettingsService => {
  const createClient = options.createClient ?? createConvexAdminClient;

  return {
    async getSettings(companyId) {
      const settings = await createClient().query(convexInternal.companySettings.get, {
        companyId,
      });

      return settings
        ? { missingPricePolicy: settings.missingPricePolicy }
        : DEFAULT_SETTINGS;
    },
  };
};
