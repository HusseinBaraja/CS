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

const createDefaultSettings = (): CompanySettings => ({ ...DEFAULT_SETTINGS });

export const createCompanySettingsService = (
  options: CompanySettingsServiceOptions = {},
): CompanySettingsService => {
  const createClient = options.createClient ?? createConvexAdminClient;

  return {
    async getSettings(companyId) {
      let settings: CompanySettings | null;
      try {
        settings = await createClient().query(convexInternal.companySettings.get, {
          companyId,
        });
      } catch {
        return createDefaultSettings();
      }

      return settings
        ? { missingPricePolicy: settings.missingPricePolicy }
        : createDefaultSettings();
    },
  };
};
