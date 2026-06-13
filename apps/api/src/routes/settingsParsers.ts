import type { UpdateCompanySettingsInput } from '../services/companies';
import type { ParseResult } from './parserUtils';

export const parseMissingPricePolicy = (
  value: unknown,
): ParseResult<UpdateCompanySettingsInput["missingPricePolicy"]> => {
  if (value === "reply_unavailable" || value === "handoff") {
    return { ok: true, value };
  }

  return {
    ok: false,
    message: "missingPricePolicy must be reply_unavailable or handoff",
  };
};

export const parsePositiveInteger = (value: unknown, fieldName: string): ParseResult<number> => {
  if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) {
    return {
      ok: false,
      message: `${fieldName} must be a positive integer`,
    };
  }

  return { ok: true, value };
};
