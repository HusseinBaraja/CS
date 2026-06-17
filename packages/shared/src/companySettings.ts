export type MissingPricePolicy = "reply_unavailable" | "handoff";

export interface CompanySettingsDefaults {
  missingPricePolicy: MissingPricePolicy;
  maxAutomatedMessageChars: number;
  operatingCurrency?: string;
}

export const DEFAULT_COMPANY_SETTINGS: CompanySettingsDefaults = {
  missingPricePolicy: "reply_unavailable",
  maxAutomatedMessageChars: 2_500,
};

export const normalizeCurrencyCode = (value: unknown): string | undefined => {
  if (typeof value !== "string") {
    return undefined;
  }

  const normalized = value.trim().toUpperCase();
  return /^[A-Z]{3}$/.test(normalized) ? normalized : undefined;
};
