import { describe, expect, test } from 'bun:test';
import type { ConvexAdminClient, Id } from '@cs/db';
import { createCompanySettingsService } from './companySettings';

const COMPANY_ID = 'company-1' as Id<'companies'>;

describe('createCompanySettingsService', () => {
  test('returns safe default settings when the Convex query fails', async () => {
    const service = createCompanySettingsService({
      createClient: () =>
        ({
          async query() {
            throw new Error('transient Convex failure');
          },
        }) as unknown as ConvexAdminClient,
    });

    const settings = await service.getSettings(COMPANY_ID);

    expect(settings).toEqual({ missingPricePolicy: 'reply_unavailable' });
  });

  test('returns a fresh default settings object for each fallback', async () => {
    const service = createCompanySettingsService({
      createClient: () =>
        ({
          async query() {
            return null;
          },
        }) as unknown as ConvexAdminClient,
    });

    const first = await service.getSettings(COMPANY_ID);
    const second = await service.getSettings(COMPANY_ID);

    expect(first).toEqual(second);
    expect(first).not.toBe(second);
  });
});
