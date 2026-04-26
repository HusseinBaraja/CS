import { render, screen } from '@testing-library/react';
import { beforeAll, describe, expect, it, vi } from 'vitest';

import logoUrl from '../../../../logo.svg';
import { DashboardPage } from './DashboardPage';

describe('DashboardPage', () => {
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

  it('renders the RTL dashboard placeholder shell', () => {
    const { container } = render(<DashboardPage />);

    expect(container.firstElementChild?.getAttribute('dir')).toBe('rtl');
    expect(screen.getByRole('heading', { name: 'هذه الصفحة قيد الإنشاء' })).toBeDefined();
    expect(screen.getByRole('button', { name: 'القائمة' })).toBeDefined();
    expect(screen.getByText('لوحة التحكم')).toBeDefined();
    expect(screen.getByText('المحادثات الأخيرة')).toBeDefined();
    expect(screen.getByText('ملخص الكتالوج')).toBeDefined();
    expect(screen.getByText('نظرة عامة على الأداء')).toBeDefined();
    expect(screen.getAllByText('البيانات غير متاحة حالياً')).toHaveLength(4);
  });

  it('uses the Reda logo artwork in the dashboard header', () => {
    const { container } = render(<DashboardPage />);

    const logo = container.querySelector('header img');

    expect(logo).toBeInstanceOf(HTMLImageElement);
    expect(logo?.getAttribute('src')).toBe(logoUrl);
    expect(logo?.getAttribute('class')).toContain('object-contain');
  });
});
