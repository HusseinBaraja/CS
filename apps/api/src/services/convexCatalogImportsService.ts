import {
  type ConvexAdminClient,
  ConvexIdValidationError,
  convexInternal,
  createConvexAdminClient,
  toCompanyId,
} from '@cs/db';
import { ERROR_CODES } from '@cs/shared';
import { parseCatalogImportWorkbook, type ParsedCatalogImportGroup } from '../catalog-import/workbookParser';
import {
  createCatalogImportDatabaseError,
  createCatalogImportNotFoundError,
  createCatalogImportValidationError,
  type CatalogImportApplyResult,
  type CatalogImportPreviewResult,
  type CatalogImportsService,
  CatalogImportsServiceError,
  type CatalogImportUploadInput,
} from './catalogImports';
import { createDefaultCatalogImportTranslator, type CatalogImportTranslator } from '../catalog-import/translation';

interface ConvexCatalogImportsServiceOptions {
  createClient?: () => ConvexAdminClient;
  translator?: CatalogImportTranslator;
}

const ERROR_PREFIXES = new Map<string, (message: string) => CatalogImportsServiceError>([
  [ERROR_CODES.NOT_FOUND, createCatalogImportNotFoundError],
  [ERROR_CODES.VALIDATION_FAILED, createCatalogImportValidationError],
]);

const parseTaggedError = (message: string): CatalogImportsServiceError | null => {
  for (const [code, createError] of ERROR_PREFIXES) {
    const marker = `${code}:`;
    const markerIndex = message.indexOf(marker);
    if (markerIndex >= 0) {
      return createError(message.slice(markerIndex + marker.length).trim() || 'Request failed');
    }
  }

  return null;
};

const CONVEX_ARGUMENT_VALIDATION_ERROR_PATTERN = /\bArgumentValidationError\b/;
const CONVEX_VALIDATION_MESSAGES = new Set([
  'Value does not match validator',
  'Unable to decode',
]);

const isConvexValidationError = (error: Error): boolean =>
  error.name === 'ArgumentValidationError' ||
  CONVEX_ARGUMENT_VALIDATION_ERROR_PATTERN.test(error.message) ||
  CONVEX_VALIDATION_MESSAGES.has(error.message);

const normalizeServiceError = (error: unknown): CatalogImportsServiceError => {
  if (error instanceof CatalogImportsServiceError) {
    return error;
  }

  if (error instanceof Error) {
    if (error instanceof ConvexIdValidationError) {
      return createCatalogImportValidationError('Invalid company identifier');
    }

    const taggedError = parseTaggedError(error.message);
    if (taggedError) {
      return taggedError;
    }

    if (isConvexValidationError(error)) {
      return createCatalogImportValidationError('Invalid catalog import payload');
    }
  }

  return createCatalogImportDatabaseError('Catalog import is temporarily unavailable');
};

const summarizeGroups = (groups: ParsedCatalogImportGroup[]) =>
  groups.map((group) => ({
    productNo: group.productNo,
    categoryName: group.rows[0]?.categoryName ?? '',
    productName: group.rows[0]?.productName ?? '',
    rowCount: group.rows.length,
    unitCount: group.rows.length,
    rows: group.rows.map((row) => row.row),
  }));

const ensureFile = (input: CatalogImportUploadInput): File => {
  if (!input.file) {
    throw createCatalogImportValidationError('Spreadsheet file is required');
  }

  return input.file;
};

const normalizeCurrency = (currency: string | undefined): string | undefined => {
  const normalized = currency?.trim().toUpperCase();
  return normalized && /^[A-Z]{3}$/.test(normalized) ? normalized : undefined;
};

const validateCompanyCurrency = (
  operatingCurrency: string | undefined,
): string => {
  const normalizedCompanyCurrency = normalizeCurrency(operatingCurrency);
  if (!normalizedCompanyCurrency) {
    throw createCatalogImportValidationError('Company operating currency must be configured before catalog import');
  }

  return normalizedCompanyCurrency;
};

export const createConvexCatalogImportsService = (
  options: ConvexCatalogImportsServiceOptions = {},
): CatalogImportsService => {
  const createClient = options.createClient ?? createConvexAdminClient;
  const translator = options.translator ?? createDefaultCatalogImportTranslator();

  const withClient = async <T>(callback: (client: ConvexAdminClient) => Promise<T>): Promise<T> => {
    try {
      return await callback(createClient());
    } catch (error) {
      throw normalizeServiceError(error);
    }
  };

  return {
    async preview(companyId, input): Promise<CatalogImportPreviewResult> {
      const file = ensureFile(input);
      return withClient(async (client) => {
        const company = await client.query(convexInternal.companies.get, {
          companyId: toCompanyId(companyId),
        });
        if (!company) {
          throw createCatalogImportNotFoundError('Company not found');
        }

        const parsed = await parseCatalogImportWorkbook(file, input.sourceLanguage);
        const settings = await client.query(convexInternal.companySettings.get, {
          companyId: toCompanyId(companyId),
        });
        let currencyError: CatalogImportsServiceError | null = null;
        try {
          validateCompanyCurrency(settings?.operatingCurrency);
        } catch (error) {
          if (error instanceof CatalogImportsServiceError) {
            currencyError = error;
          } else {
            throw error;
          }
        }
        const blockingErrors = [
          ...parsed.blockingErrors,
          ...(currencyError ? [{ message: currencyError.message }] : []),
        ];
        const translation = parsed.blockingErrors.length === 0
          && !currencyError
          ? await translator.translateGroups(parsed.groups, input.sourceLanguage, {
            generateDescriptions: input.generateDescriptions,
            translateDescriptions: false,
          })
          : { warnings: [] };

        return {
          file: parsed.file,
          sourceLanguage: input.sourceLanguage,
          groups: summarizeGroups(parsed.groups),
          categoryCount: new Set(parsed.groups.map((group) => group.rows[0]?.categoryName).filter(Boolean)).size,
          productGroupCount: parsed.groups.length,
          unitCount: parsed.groups.reduce((count, group) => count + group.rows.length, 0),
          blockingErrors,
          translationWarnings: translation.warnings,
        };
      });
    },

    async apply(companyId, input): Promise<CatalogImportApplyResult> {
      const file = ensureFile(input);
      return withClient(async (client) => {
        const company = await client.query(convexInternal.companies.get, {
          companyId: toCompanyId(companyId),
        });
        if (!company) {
          throw createCatalogImportNotFoundError('Company not found');
        }

        const parsed = await parseCatalogImportWorkbook(file, input.sourceLanguage);
        if (parsed.blockingErrors.length > 0) {
          throw createCatalogImportValidationError(parsed.blockingErrors[0]?.message ?? 'Invalid spreadsheet');
        }
        const settings = await client.query(convexInternal.companySettings.get, {
          companyId: toCompanyId(companyId),
        });
        const operatingCurrency = validateCompanyCurrency(settings?.operatingCurrency);

        const translation = await translator.translateGroups(parsed.groups, input.sourceLanguage, {
          generateDescriptions: input.generateDescriptions,
          translateDescriptions: false,
        });
        const groups = translation.groups.map((group) => ({
          ...group,
          currency: operatingCurrency,
        }));
        const result = await client.action(convexInternal.catalogImports.apply, {
          companyId: toCompanyId(companyId),
          groups,
        });

        return {
          company: {
            id: company.id,
            name: company.name,
          },
          createdOrUpdatedCategoryCount: result.createdOrUpdatedCategoryCount,
          replacedProductGroupCount: result.replacedProductGroupCount,
          replacedUnitCount: result.replacedUnitCount,
          translatedFieldCount: translation.translatedFieldCount,
          notTranslatedFallbackCount: translation.notTranslatedFallbackCount,
        };
      });
    },
  };
};
