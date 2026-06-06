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
