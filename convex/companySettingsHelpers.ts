import { DEFAULT_COMPANY_SETTINGS, normalizeCurrencyCode, type MissingPricePolicy } from '@cs/shared';
import type { Id } from './_generated/dataModel';
import type { MutationCtx, QueryCtx } from './_generated/server';

const MAX_AUTOMATED_MESSAGE_CHARS = 10_000;
const COMPANY_SETTINGS_LOCK_LEASE_MS = 15_000;
const VALIDATION_PREFIX = 'VALIDATION_FAILED';

export const sanitizeMaxAutomatedMessageChars = (value: unknown): number =>
  typeof value === 'number' &&
  Number.isInteger(value) &&
  value >= 1 &&
  value <= MAX_AUTOMATED_MESSAGE_CHARS
    ? value
    : DEFAULT_COMPANY_SETTINGS.maxAutomatedMessageChars;

export const sanitizeOperatingCurrency = normalizeCurrencyCode;

export const resolveOperatingCurrency = (
  providedValue: string | undefined,
  existingValue: unknown,
): string | undefined => {
  if (providedValue !== undefined) {
    const normalized = sanitizeOperatingCurrency(providedValue);
    if (!normalized) {
      throw new Error(`${VALIDATION_PREFIX}: operatingCurrency must be a 3-letter currency code`);
    }

    return normalized;
  }

  return sanitizeOperatingCurrency(existingValue);
};

const getCompanySettingsLockKey = (companyId: Id<'companies'>): string =>
  `companySettings:${companyId}`;

export const listSettingsForCompany = async (
  ctx: Pick<QueryCtx | MutationCtx, 'db'>,
  companyId: Id<'companies'>,
) =>
  ctx.db
    .query('companySettings')
    .withIndex('by_company', (q) => q.eq('companyId', companyId))
    .collect();

export const chooseCanonicalByCreation = <T extends { _creationTime: number; _id: string }>(
  rows: T[],
) =>
  [...rows].sort((left, right) =>
    left._creationTime - right._creationTime || left._id.localeCompare(right._id),
  )[0];

export const chooseCanonicalSettings = (
  settings: Awaited<ReturnType<typeof listSettingsForCompany>>,
) => chooseCanonicalByCreation(settings);

export const collapseSettingsRows = async (
  ctx: Pick<MutationCtx, 'db'>,
  settingsRows: Awaited<ReturnType<typeof listSettingsForCompany>>,
  missingPricePolicy: MissingPricePolicy,
  maxAutomatedMessageChars: number,
  operatingCurrency: string | undefined,
) => {
  const canonical = chooseCanonicalSettings(settingsRows);
  if (!canonical) {
    return null;
  }

  await ctx.db.patch(canonical._id, {
    missingPricePolicy,
    maxAutomatedMessageChars,
    operatingCurrency,
  });
  await Promise.all(
    settingsRows
      .filter((settings) => settings._id !== canonical._id)
      .map((settings) => ctx.db.delete(settings._id)),
  );

  return canonical;
};

export const acquireCompanySettingsLock = async (
  ctx: Pick<MutationCtx, 'db'>,
  companyId: Id<'companies'>,
  ownerToken: string,
  now: number,
): Promise<string> => {
  const key = getCompanySettingsLockKey(companyId);
  const locks = await ctx.db
    .query('jobLocks')
    .withIndex('by_key', (q) => q.eq('key', key))
    .collect();
  const conflictingLock = locks.find(
    (row) => row.ownerToken !== ownerToken && row.expiresAt > now,
  );
  if (conflictingLock) {
    throw new Error(`Company settings upsert already in progress for companyId=${companyId}`);
  }
  const lock = chooseCanonicalByCreation(locks);

  if (!lock) {
    await ctx.db.insert('jobLocks', {
      key,
      ownerToken,
      acquiredAt: now,
      expiresAt: now + COMPANY_SETTINGS_LOCK_LEASE_MS,
    });
    return key;
  }

  await ctx.db.patch(lock._id, {
    ownerToken,
    acquiredAt: now,
    expiresAt: now + COMPANY_SETTINGS_LOCK_LEASE_MS,
  });

  await Promise.all(
    locks.filter((row) => row._id !== lock._id).map((row) => ctx.db.delete(row._id)),
  );

  return key;
};

export const releaseCompanySettingsLock = async (
  ctx: Pick<MutationCtx, 'db'>,
  key: string,
  ownerToken: string,
): Promise<void> => {
  const locks = await ctx.db
    .query('jobLocks')
    .withIndex('by_key', (q) => q.eq('key', key))
    .collect();

  await Promise.all(
    locks
      .filter((lock) => lock.ownerToken === ownerToken)
      .map((lock) => ctx.db.delete(lock._id)),
  );
};
