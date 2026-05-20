import {
  convexInternal,
  createConvexAdminClient,
  type ConvexAdminClient,
  type Id,
} from '@cs/db';
import {
  DEFAULT_COMPANY_SETTINGS,
  type MissingPricePolicy,
} from '@cs/shared';

export type { MissingPricePolicy } from '@cs/shared';

export interface CompanySettings {
  missingPricePolicy: MissingPricePolicy;
  maxAutomatedMessageChars: number;
}

export interface CompanySettingsService {
  getSettings(companyId: Id<'companies'>): Promise<CompanySettings>;
}

export interface CompanySettingsServiceOptions {
  createClient?: () => ConvexAdminClient;
}

const DEFAULT_SETTINGS: CompanySettings = {
  missingPricePolicy: DEFAULT_COMPANY_SETTINGS.missingPricePolicy,
  maxAutomatedMessageChars: DEFAULT_COMPANY_SETTINGS.maxAutomatedMessageChars,
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
        ? {
            missingPricePolicy: settings.missingPricePolicy,
            maxAutomatedMessageChars: settings.maxAutomatedMessageChars,
          }
        : createDefaultSettings();
    },
  };
};
