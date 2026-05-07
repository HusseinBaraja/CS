import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

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

  afterEach(() => {
    vi.clearAllMocks();
    cleanup();
  });

  it('renders the catalog import upload surface empty by default', () => {
    render(<UploadDataPage />);

    expect(screen.getByRole('heading', { name: 'رفع كتالوج المنتجات' })).toBeDefined();
    expect(screen.getAllByText(/Excel/).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByRole('button', { name: /تنزيل القالب/ })).toBeDefined();
    expect(screen.getByRole('button', { name: /رفع الملف/ })).toBeDefined();
    expect(screen.getByText('لم يتم رفع أي ملف بعد.')).toBeDefined();
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

  it('passes selected template options to the download action', () => {
    render(<UploadDataPage />);

    fireEvent.click(screen.getByRole('button', { name: /تنزيل القالب/ }));
    fireEvent.click(screen.getByRole('radio', { name: 'YER' }));
    fireEvent.click(screen.getByRole('radio', { name: 'English' }));
    fireEvent.click(within(screen.getByRole('group', { name: 'تضمين الصورة الرئيسية' })).getByRole('radio', { name: 'لا' }));
    fireEvent.click(within(screen.getByRole('group', { name: 'تضمين الوصف' })).getByRole('radio', { name: 'لا' }));
    fireEvent.click(within(screen.getByRole('group', { name: 'تضمين المتغيرات' })).getByRole('radio', { name: 'لا' }));
    fireEvent.click(screen.getByRole('button', { name: /تحميل ملف Excel/ }));

    expect(downloadCatalogTemplate).toHaveBeenCalledWith({
      currency: 'YER',
      includePrice: true,
      language: 'en',
      includeDescription: false,
      includePrimaryImage: false,
      includeVariants: false,
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

  it('shows one simulated uploaded file row after clicking upload', () => {
    render(<UploadDataPage />);

    fireEvent.click(screen.getByRole('button', { name: /رفع الملف/ }));

    expect(screen.getByText('reda-catalog-template.xlsx')).toBeDefined();
    expect(screen.getByText('28 أبريل 2026')).toBeDefined();
    expect(screen.getByText('11 أعمدة')).toBeDefined();
    expect(screen.getByText('124 صف')).toBeDefined();
    expect(screen.getByText('86 KB')).toBeDefined();
    expect(screen.getByText('جاهز')).toBeDefined();
    expect(screen.queryByText('لم يتم رفع أي ملف بعد.')).toBeNull();
  });

  it('marks the upload sidebar item active', () => {
    render(<UploadDataPage />);

    const uploadLink = screen.getByRole('link', { name: 'رفع البيانات' });
    const navButton = uploadLink.closest('[data-sidebar="menu-button"]');

    expect(uploadLink.getAttribute('href')).toBe('/dashboard/upload');
    expect(navButton?.getAttribute('data-active')).toBe('true');
  });

});
