import { afterEach, describe, expect, it, vi } from 'vitest';

import { getCompanySettings, updateCompanySettings } from './companySettingsApi';

const settings = {
  id: 'settings-1',
  companyId: 'company/id with spaces',
  missingPricePolicy: 'reply_unavailable',
  maxAutomatedMessageChars: 2_500,
  operatingCurrency: 'SAR',
};

describe('companySettingsApi', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('URL-encodes company id for settings reads', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({
      ok: true,
      settings,
    })));

    await getCompanySettings('company/id with spaces');

    expect(fetchMock).toHaveBeenCalledWith('/api/companies/company%2Fid%20with%20spaces/settings');
  });

  it('sends full settings payload for updates', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({
      ok: true,
      settings: { ...settings, operatingCurrency: 'YER' },
    })));

    await updateCompanySettings('company/id with spaces', {
      missingPricePolicy: 'reply_unavailable',
      maxAutomatedMessageChars: 2_500,
      operatingCurrency: 'YER',
    });

    expect(fetchMock).toHaveBeenCalledWith('/api/companies/company%2Fid%20with%20spaces/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        missingPricePolicy: 'reply_unavailable',
        maxAutomatedMessageChars: 2_500,
        operatingCurrency: 'YER',
      }),
    });
  });
});
