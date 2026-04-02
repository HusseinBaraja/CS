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

describe('ContactPage', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('renders env-backed contact details and resets the form after submit', async () => {
    setupGsapMocks();
    vi.stubEnv('SITE_CONTACT_PHONE_NUMBER', '+967 784 338 919');
    vi.stubEnv('SITE_CONTACT_EMAIL_ADDRESS', 'hello@reda.chat');
    const alertMock = vi.spyOn(window, 'alert').mockImplementation(() => {});

    const { ContactPage } = await import('./ContactPage');
    render(<ContactPage />);

    expect(screen.getByRole('heading', { name: 'جاهزين نسمع منك ونرتب معك البداية' })).toBeDefined();
    expect(screen.getByText('مخصص للأعمال في اليمن التي تريد خدمة عملاء أسرع على واتساب بدون تعقيد.')).toBeDefined();
    expect(screen.getByText('+967 784 338 919')).toBeDefined();
    expect(screen.getByText('hello@reda.chat')).toBeDefined();
    expect(screen.getByText('المقر الرئيسي')).toBeDefined();

    const nameInput = screen.getByPlaceholderText('مثال: محمد الآنسي');
    const phoneInput = screen.getByPlaceholderText('+967 7xx xxx xxx');
    const companyInput = screen.getByPlaceholderText('مثال: مؤسسة الخير للتجارة');
    const messageInput = screen.getByPlaceholderText('اكتب لنا طبيعة شغلك أو عدد الرسائل التي تستقبلها يومياً');

    fireEvent.change(nameInput, { target: { value: 'محمد الآنسي' } });
    fireEvent.change(phoneInput, { target: { value: '+967771234567' } });
    fireEvent.change(companyInput, { target: { value: 'مؤسسة الخير للتجارة' } });
    fireEvent.change(messageInput, { target: { value: 'نحتاج بوت يرد على العملاء في الواتساب' } });

    fireEvent.click(screen.getByRole('button', { name: 'أرسل طلبك' }));

    expect(alertMock).toHaveBeenCalledWith('شكراً لتواصلك معنا. هذه نسخة تجريبية، وتم استلام طلبك بنجاح.');
    expect((nameInput as HTMLInputElement).value).toBe('');
    expect((phoneInput as HTMLInputElement).value).toBe('');
    expect((companyInput as HTMLInputElement).value).toBe('');
    expect((messageInput as HTMLTextAreaElement).value).toBe('');
  });

  it('hides phone and email rows when contact env vars are missing', async () => {
    setupGsapMocks();

    const { ContactPage } = await import('./ContactPage');
    render(<ContactPage />);

    expect(screen.queryByText('واتساب للتواصل')).toBeNull();
    expect(screen.queryByText('البريد الإلكتروني')).toBeNull();
    expect(screen.getByText('المقر الرئيسي')).toBeDefined();
    expect(screen.queryByText('[PHONE_NUMBER]')).toBeNull();
    expect(screen.queryByText('[EMAIL_ADDRESS]')).toBeNull();
  });
});
