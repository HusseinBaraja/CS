import { createCompanySessionKey } from '@cs/shared';

export const createSessionKey = (companyId: string): string =>
  createCompanySessionKey(companyId);
