import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { setupGsapMocks } from '../test/setupGsapMocks';

vi.mock('../components/router/HonoRouter', () => ({
  Link: ({ href, children, className }: any) => (
    <a href={href} className={className}>
      {children}
    </a>
  ),
}));

describe('TrialPage', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('renders Yemeni trial copy and confirms registration on submit', async () => {
    setupGsapMocks();
    const alertMock = vi.spyOn(window, 'alert').mockImplementation(() => {});

    const { TrialPage } = await import('./TrialPage');
    const { container } = render(<TrialPage />);

    expect(screen.getByRole('heading', { name: 'جرّب رضا على واتساب مع نشاطك' })).toBeDefined();
    expect(screen.getByText('عبّ بياناتك وبنتواصل معك لترتيب تجربة تناسب شغلك وطريقة ردك مع العملاء في اليمن.')).toBeDefined();
    expect(screen.getByRole('heading', { name: 'ما الذي ستحصل عليه في التجربة؟' })).toBeDefined();
    expect(screen.getByText('ردود مرتبة باللهجة المناسبة')).toBeDefined();
    expect(screen.getByText('تهيئة تناسب نشاطك')).toBeDefined();
    expect(container.querySelector('.trial-button-shine')).toBeTruthy();

    fireEvent.change(screen.getByPlaceholderText('الاسم الكامل'), { target: { value: 'أحمد القباطي' } });
    fireEvent.change(screen.getByPlaceholderText('+967 7xx xxx xxx'), { target: { value: '+967771234567' } });
    fireEvent.change(screen.getByPlaceholderText('اسم المحل أو الشركة'), { target: { value: 'مخازن القباطي' } });

    fireEvent.click(screen.getByRole('button', { name: 'احجز التجربة المجانية' }));

    expect(alertMock).toHaveBeenCalledWith('تم تسجيل طلبك. بيتواصل معك فريقنا قريباً لترتيب التجربة المجانية.');
  });
});
