import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { UploadDataPage } from './UploadDataPage';

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
  });

  it('shows one simulated uploaded file row after clicking upload', () => {
    render(<UploadDataPage />);

    fireEvent.click(screen.getByRole('button', { name: /رفع الملف/ }));

    expect(screen.getByText('reda-catalog-template.xlsx')).toBeDefined();
    expect(screen.getByText('28 أبريل 2026')).toBeDefined();
    expect(screen.getByText('7 أعمدة')).toBeDefined();
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
