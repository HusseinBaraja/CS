import { createCompanySessionKey } from '@cs/shared';

const SESSION_KEY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]*$/;

export const createSessionKey = (companyId: string): string =>
  createCompanySessionKey(companyId);

export const normalizeSessionKey = (
  sessionKey: string,
  fieldName: string,
): string => {
  const normalizedSessionKey = sessionKey.trim();
  if (!SESSION_KEY_PATTERN.test(normalizedSessionKey)) {
    throw new Error(`Invalid ${fieldName}: expected a safe single-segment identifier`);
  }

  return normalizedSessionKey;
};
