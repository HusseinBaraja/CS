export type SourceLanguage = 'ar' | 'en';

export interface CompanyDto {
  id: string;
  name: string;
  ownerPhone?: string;
  config?: {
    botEnabled?: boolean;
  };
}

export interface CatalogImportPreview {
  file: {
    filename: string;
    sizeBytes: number;
    contentType?: string;
  };
  sourceLanguage: SourceLanguage;
  groups: Array<{
    productNo: string;
    categoryName: string;
    productName: string;
    rowCount: number;
    unitCount: number;
    rows: number[];
  }>;
  categoryCount: number;
  productGroupCount: number;
  unitCount: number;
  blockingErrors: Array<{ message: string; row?: number; productNo?: string }>;
  translationWarnings: Array<{ productNo: string; field: string; message: string }>;
}

export interface CatalogImportApplyResult {
  company: {
    id: string;
    name: string;
  };
  createdOrUpdatedCategoryCount: number;
  replacedProductGroupCount: number;
  replacedUnitCount: number;
  translatedFieldCount: number;
  notTranslatedFallbackCount: number;
}

export const parseJsonResponse = async <T>(response: Response): Promise<T> => {
  const rawText = await response.text();
  let payload: T | { error?: { message?: string }; message?: string } | string | undefined;
  if (rawText.length > 0) {
    try {
      payload = JSON.parse(rawText) as T | { error?: { message?: string }; message?: string };
    } catch {
      payload = rawText;
    }
  }

  if (!response.ok) {
    const maybeError = payload as { error?: { message?: string }; message?: string };
    const message = typeof payload === 'string'
      ? payload
      : maybeError?.error?.message ?? maybeError?.message;
    throw new Error(message ?? response.statusText ?? 'Request failed');
  }

  return payload as T;
};

export const listCompanies = async (): Promise<CompanyDto[]> => {
  const payload = await parseJsonResponse<{ ok: true; companies: CompanyDto[] }>(
    await fetch('/api/companies'),
  );
  return payload.companies;
};

export const resolveYasTradingCompany = (companies: CompanyDto[]): {
  company?: CompanyDto;
  error?: string;
} => {
  const normalizedTargetNames = new Set(['yas trading', 'yas packaging co']);
  const normalizeCompanyName = (name: string) =>
    name.trim().replace(/_/g, ' ').replace(/\s+/g, ' ').toLocaleLowerCase();
  const exactMatches = companies.filter((company) => company.name === 'YAS_Trading');
  const aliasMatches = companies.filter((company) => normalizedTargetNames.has(normalizeCompanyName(company.name)));
  const matches = exactMatches.length > 0
    ? exactMatches
    : aliasMatches;

  if (matches.length === 0) {
    return { error: 'شركة YAS_Trading غير موجودة.' };
  }

  if (exactMatches.length === 0 && matches.length > 1) {
    const activeAliasMatches = matches.filter((company) => company.config?.botEnabled === true);
    if (activeAliasMatches.length === 1) {
      return { company: activeAliasMatches[0] };
    }

    const nonSampleOwnerMatches = matches.filter((company) => company.ownerPhone !== '967700000001');
    if (nonSampleOwnerMatches.length === 1) {
      return { company: nonSampleOwnerMatches[0] };
    }
  }

  if (matches.length > 1) {
    return { error: 'يوجد أكثر من شركة باسم YAS_Trading.' };
  }

  return { company: matches[0] };
};

const catalogImportFormData = (file: File, sourceLanguage: SourceLanguage): FormData => {
  const formData = new FormData();
  formData.set('file', file);
  formData.set('sourceLanguage', sourceLanguage);
  return formData;
};

export const previewCatalogImport = async (
  companyId: string,
  file: File,
  sourceLanguage: SourceLanguage,
): Promise<CatalogImportPreview> => {
  const encodedCompanyId = encodeURIComponent(companyId);
  const payload = await parseJsonResponse<{ ok: true; preview: CatalogImportPreview }>(
    await fetch(`/api/companies/${encodedCompanyId}/catalog-imports/preview`, {
      method: 'POST',
      body: catalogImportFormData(file, sourceLanguage),
    }),
  );
  return payload.preview;
};

export const applyCatalogImport = async (
  companyId: string,
  file: File,
  sourceLanguage: SourceLanguage,
): Promise<CatalogImportApplyResult> => {
  const encodedCompanyId = encodeURIComponent(companyId);
  const payload = await parseJsonResponse<{ ok: true; result: CatalogImportApplyResult }>(
    await fetch(`/api/companies/${encodedCompanyId}/catalog-imports/apply`, {
      method: 'POST',
      body: catalogImportFormData(file, sourceLanguage),
    }),
  );
  return payload.result;
};
