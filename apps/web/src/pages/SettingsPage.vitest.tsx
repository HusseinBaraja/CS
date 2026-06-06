import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { SettingsPage } from './SettingsPage';

const settings = {
  id: 'settings-1',
  companyId: 'company-1',
  missingPricePolicy: 'handoff',
  maxAutomatedMessageChars: 3_000,
  operatingCurrency: 'SAR',
};

describe('SettingsPage', () => {
  beforeAll(() => {
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    });
  });

  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === '/api/companies') {
        return new Response(JSON.stringify({
          ok: true,
          companies: [{ id: 'company-1', name: 'YAS_Trading' }],
        }));
      }

      if (url === '/api/companies/company-1/settings' && init?.method === 'PUT') {
        return new Response(JSON.stringify({
          ok: true,
          settings: { ...settings, operatingCurrency: 'YER' },
        }));
      }

      if (url === '/api/companies/company-1/settings') {
        return new Response(JSON.stringify({ ok: true, settings }));
      }

      return new Response('{}', { status: 404 });
    }));
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
    cleanup();
  });

  it('loads YAS_Trading settings and displays the saved currency', async () => {
    render(<SettingsPage />);

    expect(screen.getByText('جار تحميل الإعدادات')).toBeDefined();
    await waitFor(() => expect(screen.getByText('القيمة المحفوظة: SAR')).toBeDefined());
    expect(screen.getByRole('radio', { name: 'SAR' }).getAttribute('data-state')).toBe('on');
  });

  it('loads settings for the seeded demo company alias', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === '/api/companies') {
        return new Response(JSON.stringify({
          ok: true,
          companies: [{ id: 'seed-company', name: 'YAS Packaging Co' }],
        }));
      }

      if (url === '/api/companies/seed-company/settings') {
        return new Response(JSON.stringify({
          ok: true,
          settings: { ...settings, companyId: 'seed-company' },
        }));
      }

      return new Response('{}', { status: 404 });
    }));

    render(<SettingsPage />);

    await waitFor(() => expect(screen.getByText('YAS Packaging Co')).toBeDefined());
    expect(screen.getByText('القيمة المحفوظة: SAR')).toBeDefined();
  });

  it('saves the selected currency with preserved settings fields', async () => {
    render(<SettingsPage />);
    await waitFor(() => expect(screen.getByText('القيمة المحفوظة: SAR')).toBeDefined());

    fireEvent.click(screen.getByRole('radio', { name: 'YER' }));
    fireEvent.click(screen.getByRole('button', { name: /حفظ/ }));

    await waitFor(() => expect(screen.getByText('تم حفظ العملة.')).toBeDefined());
    const calls = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls;
    const updateCall = calls.find(([url, init]) => String(url).endsWith('/settings') && init?.method === 'PUT');

    expect(updateCall?.[1]).toMatchObject({
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        missingPricePolicy: 'handoff',
        maxAutomatedMessageChars: 3_000,
        operatingCurrency: 'YER',
      }),
    });
  });

  it('enables saving after choosing a currency when no valid currency is saved', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === '/api/companies') {
        return new Response(JSON.stringify({
          ok: true,
          companies: [{ id: 'company-1', name: 'YAS_Trading' }],
        }));
      }

      if (url === '/api/companies/company-1/settings' && init?.method === 'PUT') {
        return new Response(JSON.stringify({
          ok: true,
          settings: { ...settings, operatingCurrency: 'YER' },
        }));
      }

      return new Response(JSON.stringify({
        ok: true,
        settings: { ...settings, operatingCurrency: undefined },
      }));
    }));

    render(<SettingsPage />);
    await waitFor(() => expect(screen.getByText('القيمة المحفوظة: غير محددة')).toBeDefined());

    const saveButton = screen.getByRole('button', { name: /حفظ/ });
    expect(saveButton.hasAttribute('disabled')).toBe(true);

    fireEvent.click(screen.getByRole('radio', { name: 'YER' }));

    expect(saveButton.hasAttribute('disabled')).toBe(false);
    fireEvent.click(saveButton);
    await waitFor(() => expect(screen.getByText('تم حفظ العملة.')).toBeDefined());
  });

  it('blocks saving when YAS_Trading is missing', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ ok: true, companies: [] }))));

    render(<SettingsPage />);

    await waitFor(() => expect(screen.getByText('شركة YAS_Trading غير موجودة.')).toBeDefined());
    expect(screen.queryByRole('button', { name: /حفظ/ })).toBeNull();
    expect(screen.queryByRole('group', { name: 'اختيار عملة التشغيل' })).toBeNull();
  });

  it('blocks saving when YAS_Trading is duplicated', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      ok: true,
      companies: [
        { id: 'company-1', name: 'YAS_Trading' },
        { id: 'company-2', name: 'YAS_Trading' },
      ],
    }))));

    render(<SettingsPage />);

    await waitFor(() => expect(screen.getByText('يوجد أكثر من شركة باسم YAS_Trading.')).toBeDefined());
    expect(screen.queryByRole('button', { name: /حفظ/ })).toBeNull();
    expect(screen.queryByRole('group', { name: 'اختيار عملة التشغيل' })).toBeNull();
  });

  it('shows save failures', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === '/api/companies') {
        return new Response(JSON.stringify({
          ok: true,
          companies: [{ id: 'company-1', name: 'YAS_Trading' }],
        }));
      }
      if (init?.method === 'PUT') {
        return new Response(JSON.stringify({ error: { message: 'validation failed' } }), { status: 400 });
      }
      return new Response(JSON.stringify({ ok: true, settings }));
    }));

    render(<SettingsPage />);
    await waitFor(() => expect(screen.getByText('القيمة المحفوظة: SAR')).toBeDefined());

    fireEvent.click(screen.getByRole('radio', { name: 'YER' }));
    fireEvent.click(screen.getByRole('button', { name: /حفظ/ }));

    await waitFor(() => expect(screen.getByText('validation failed')).toBeDefined());
  });

  it('marks the settings sidebar item active', async () => {
    render(<SettingsPage />);

    const settingsLink = screen.getByRole('link', { name: 'الإعدادات' });
    const navButton = settingsLink.closest('[data-sidebar="menu-button"]');

    expect(settingsLink.getAttribute('href')).toBe('/dashboard/settings');
    expect(navButton?.getAttribute('data-active')).toBe('true');
  });
});
