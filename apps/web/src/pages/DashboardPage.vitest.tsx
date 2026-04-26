import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { DashboardPage } from './DashboardPage';

describe('DashboardPage', () => {
  it('renders the RTL dashboard placeholder shell', () => {
    const { container } = render(<DashboardPage />);

    expect(container.firstElementChild?.getAttribute('dir')).toBe('rtl');
    expect(screen.getByRole('heading', { name: 'هذه الصفحة قيد الإنشاء' })).toBeDefined();
    expect(screen.getByText('لوحة التحكم')).toBeDefined();
    expect(screen.getByText('المحادثات الأخيرة')).toBeDefined();
    expect(screen.getByText('ملخص الكتالوج')).toBeDefined();
    expect(screen.getByText('نظرة عامة على الأداء')).toBeDefined();
    expect(screen.getAllByText('البيانات غير متاحة حالياً')).toHaveLength(4);
  });
});
