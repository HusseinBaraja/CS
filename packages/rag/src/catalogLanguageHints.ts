import type { CatalogLanguageHints } from '@cs/shared';
import {
  type ConvexAdminClient,
  type Id,
  convexInternal,
  createConvexAdminClient,
} from '@cs/db';

export interface CatalogLanguageHintsService {
  getHints(
    companyId: Id<"companies">,
  ): Promise<CatalogLanguageHints | null>;
}

export interface CatalogLanguageHintsServiceOptions {
  createClient?: () => ConvexAdminClient;
}

export const createCatalogLanguageHintsService = (
  options: CatalogLanguageHintsServiceOptions = {},
): CatalogLanguageHintsService => {
  const createClient = options.createClient ?? createConvexAdminClient;

  return {
    async getHints(companyId) {
      const client = createClient();
      return client.query(convexInternal.companies.getCatalogLanguageHints, {
        companyId,
      });
    },
  };
};
