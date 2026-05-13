import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { UploadDataPage } from './UploadDataPage';
import { downloadCatalogTemplate } from '../features/catalog-import/downloadCatalogTemplate';

vi.mock('../features/catalog-import/downloadCatalogTemplate', () => ({
  downloadCatalogTemplate: vi.fn(),
}));

describe('UploadDataPage', () => {
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
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === '/api/companies') {
        return new Response(JSON.stringify({
          ok: true,
          companies: [{ id: 'company-1', name: 'YAS_Trading' }],
        }));
      }

      if (url.includes('/preview')) {
        return new Response(JSON.stringify({
          ok: true,
          preview: {
            file: { filename: 'catalog.xlsx', sizeBytes: 1024 },
            sourceLanguage: 'ar',
            groups: [{
              productNo: 'P-1',
              categoryName: 'أكواب',
              productName: 'كوب ورقي',
              rowCount: 2,
              variantCount: 2,
              rows: [2, 3],
            }],
            categoryCount: 1,
            productGroupCount: 1,
            variantCount: 2,
            blockingErrors: [],
            translationWarnings: [],
          },
        }));
      }

      if (url.includes('/apply')) {
        return new Response(JSON.stringify({
          ok: true,
          result: {
            company: { id: 'company-1', name: 'YAS_Trading' },
            createdOrUpdatedCategoryCount: 1,
            replacedProductGroupCount: 1,
            replacedVariantCount: 2,
            translatedFieldCount: 4,
            notTranslatedFallbackCount: 0,
          },
        }));
      }

      return new Response('{}', { status: 404 });
    }));
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
    cleanup();
  });

  it('renders the catalog import upload surface empty by default', async () => {
    render(<UploadDataPage />);

    expect(screen.getByRole('heading', { name: 'استيراد كتالوج YAS_Trading' })).toBeDefined();
    expect(screen.getAllByText(/Excel/).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByRole('button', { name: /تنزيل القالب/ })).toBeDefined();
    expect(screen.getByRole('button', { name: /معاينة/ })).toBeDefined();
    expect(screen.getByLabelText('ملف الكتالوج')).toBeDefined();
    expect(screen.getByText('لم تتم معاينة أي ملف بعد.')).toBeDefined();
    await waitFor(() => expect(screen.getByText('YAS_Trading')).toBeDefined());
    expect(screen.queryByText('reda-catalog-template.xlsx')).toBeNull();
    expect(downloadCatalogTemplate).not.toHaveBeenCalled();
  });

  it('opens template options without downloading immediately', () => {
    render(<UploadDataPage />);

    fireEvent.click(screen.getByRole('button', { name: /تنزيل القالب/ }));

    expect(screen.getByRole('group', { name: 'اختيار العملة' })).toBeDefined();
    expect(screen.getByRole('group', { name: 'تضمين السعر' })).toBeDefined();
    expect(screen.getByRole('group', { name: 'اختيار اللغة' })).toBeDefined();
    expect(screen.getByRole('group', { name: 'تضمين الصورة الرئيسية' })).toBeDefined();
    expect(screen.getByRole('group', { name: 'تضمين الوصف' })).toBeDefined();
    expect(screen.getByRole('group', { name: 'تضمين المتغيرات' })).toBeDefined();
    expect(screen.getByRole('button', { name: /تحميل ملف Excel/ })).toBeDefined();
    expect(downloadCatalogTemplate).not.toHaveBeenCalled();
  });

  it('shows price before currency in template options', () => {
    render(<UploadDataPage />);

    fireEvent.click(screen.getByRole('button', { name: /تنزيل القالب/ }));

    const priceGroup = screen.getByRole('group', { name: 'تضمين السعر' });
    const currencyGroup = screen.getByRole('group', { name: 'اختيار العملة' });

    expect(priceGroup.compareDocumentPosition(currencyGroup) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('passes selected template options to the download action', async () => {
    render(<UploadDataPage />);

    fireEvent.click(screen.getByRole('button', { name: /تنزيل القالب/ }));
    fireEvent.click(screen.getByRole('radio', { name: 'YER' }));
    fireEvent.click(screen.getByRole('radio', { name: 'English' }));
    fireEvent.click(within(screen.getByRole('group', { name: 'تضمين الصورة الرئيسية' })).getByRole('radio', { name: 'لا' }));
    fireEvent.click(within(screen.getByRole('group', { name: 'تضمين الوصف' })).getByRole('radio', { name: 'لا' }));
    fireEvent.click(within(screen.getByRole('group', { name: 'تضمين المتغيرات' })).getByRole('radio', { name: 'لا' }));
    fireEvent.click(screen.getByRole('button', { name: /تحميل ملف Excel/ }));

    await waitFor(() => {
      expect(downloadCatalogTemplate).toHaveBeenCalledWith({
        currency: 'YER',
        includePrice: true,
        language: 'en',
        includeDescription: false,
        includePrimaryImage: false,
        includeVariants: false,
      });
    });
  });

  it('disables currency selection when price is off', () => {
    render(<UploadDataPage />);

    fireEvent.click(screen.getByRole('button', { name: /تنزيل القالب/ }));
    fireEvent.click(
      within(screen.getByRole('group', { name: 'تضمين السعر' }))
        .getByRole('radio', { name: 'لا' }),
    );

    expect(screen.getByRole('radio', { name: 'SAR' }).hasAttribute('disabled')).toBe(true);
    expect(screen.getByRole('radio', { name: 'YER' }).hasAttribute('disabled')).toBe(true);
  });

  it('previews and applies the selected file', async () => {
    render(<UploadDataPage />);
    await waitFor(() => expect(screen.getByText('YAS_Trading')).toBeDefined());

    const file = new File(['fake'], 'catalog.xlsx', { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    fireEvent.change(screen.getByLabelText('ملف الكتالوج'), {
      target: { files: [file] },
    });
    fireEvent.change(screen.getByLabelText('لغة مصدر الملف'), {
      target: { value: 'en' },
    });
    fireEvent.click(screen.getByRole('button', { name: /معاينة/ }));

    await waitFor(() => expect(screen.getByText('P-1')).toBeDefined());
    fireEvent.click(screen.getByRole('button', { name: /تطبيق الاستيراد/ }));

    await waitFor(() => expect(screen.getByText(/تم تطبيق 1 منتجات و 2 متغيرات/)).toBeDefined());
    const calls = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls;
    expect(calls.some(([url]) => String(url).includes('/preview'))).toBe(true);
    expect(calls.some(([url]) => String(url).includes('/apply'))).toBe(true);
  });

  it('blocks when YAS_Trading is missing', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ ok: true, companies: [] }))));
    render(<UploadDataPage />);

    await waitFor(() => expect(screen.getByText('شركة YAS_Trading غير موجودة.')).toBeDefined());
    expect(screen.getByRole('button', { name: /معاينة/ }).hasAttribute('disabled')).toBe(true);
  });

  it('blocks when YAS_Trading is duplicated', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      ok: true,
      companies: [
        { id: 'company-1', name: 'YAS_Trading' },
        { id: 'company-2', name: 'YAS_Trading' },
      ],
    }))));
    render(<UploadDataPage />);

    await waitFor(() => expect(screen.getByText('يوجد أكثر من شركة باسم YAS_Trading.')).toBeDefined());
    expect(screen.getByRole('button', { name: /معاينة/ }).hasAttribute('disabled')).toBe(true);
  });

  it('marks the upload sidebar item active', () => {
    render(<UploadDataPage />);

    const uploadLink = screen.getByRole('link', { name: 'رفع البيانات' });
    const navButton = uploadLink.closest('[data-sidebar="menu-button"]');

    expect(uploadLink.getAttribute('href')).toBe('/dashboard/upload');
    expect(navButton?.getAttribute('data-active')).toBe('true');
  });

});
