import { parseJsonResponse } from '../catalog-import/catalogImportApi';

export type MissingPricePolicy = 'reply_unavailable' | 'handoff';

export interface CompanySettings {
  id: string;
  companyId: string;
  missingPricePolicy: MissingPricePolicy;
  maxAutomatedMessageChars: number;
  operatingCurrency?: string;
}

export type UpdateCompanySettingsInput = Pick<
  CompanySettings,
  'missingPricePolicy' | 'maxAutomatedMessageChars' | 'operatingCurrency'
>;

const settingsUrl = (companyId: string) =>
  `/api/companies/${encodeURIComponent(companyId)}/settings`;

export const getCompanySettings = async (companyId: string): Promise<CompanySettings> => {
  const payload = await parseJsonResponse<{ ok: true; settings: CompanySettings }>(
    await fetch(settingsUrl(companyId)),
  );
  return payload.settings;
};

export const updateCompanySettings = async (
  companyId: string,
  settings: UpdateCompanySettingsInput,
): Promise<CompanySettings> => {
  const payload = await parseJsonResponse<{ ok: true; settings: CompanySettings }>(
    await fetch(settingsUrl(companyId), {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(settings),
    }),
  );
  return payload.settings;
};
