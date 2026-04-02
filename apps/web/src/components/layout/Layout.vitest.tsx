import { cleanup, createEvent, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Layout } from './Layout';

// Mock useLocation to control the path in tests
const mockNavigate = vi.fn();
let mockPath = '/';

vi.mock('../router/HonoRouter', () => ({
  useLocation: () => ({ path: mockPath, navigate: mockNavigate }),
  Link: ({ href, children, className, onClick }: any) => (
    <a href={href} className={className} onClick={onClick}>
      {children}
    </a>
  ),
}));

describe('Layout', () => {
  const scrollToMock = vi.fn();

  afterEach(() => {
    scrollToMock.mockReset();
    mockPath = '/';
    cleanup();
  });

  it('renders the footer logo as an accessible button that scrolls to the top', () => {
    Object.defineProperty(window, 'scrollTo', {
      value: scrollToMock,
      writable: true,
    });

    render(
      <Layout>
        <div>content</div>
      </Layout>,
    );

    const footerLogoButton = screen.getByRole('button', { name: 'العودة إلى أعلى الصفحة' });

    expect(footerLogoButton).toBeInstanceOf(HTMLButtonElement);

    fireEvent.click(footerLogoButton);

    expect(scrollToMock).toHaveBeenCalledWith({ top: 0, behavior: 'smooth' });
  });

  it('keeps the custom watermark height utilities on the footer logo artwork', () => {
    render(
      <Layout>
        <div>content</div>
      </Layout>,
    );

    const decorativeImages = screen.getAllByRole('img', { hidden: true });
    const watermarkImage = decorativeImages.find((image) => image.className.includes('h-150'));

    expect(watermarkImage).toBeDefined();
    expect(watermarkImage?.className).toContain('h-150');
    expect(watermarkImage?.className).toContain('md:h-225');
  });

  it('uses the logo link with href="/" and scrolls to top when on landing page', () => {
    Object.defineProperty(window, 'scrollTo', {
      value: scrollToMock,
      writable: true,
    });

    mockPath = '/';

    render(
      <Layout>
        <div>content</div>
      </Layout>,
    );

    const [navLogoLink] = screen.getAllByRole('link', { name: 'CSCB' });
    const clickEvent = createEvent.click(navLogoLink);
    clickEvent.preventDefault = vi.fn();

    expect(navLogoLink.getAttribute('href')).toBe('/');

    fireEvent(navLogoLink, clickEvent);

    expect(clickEvent.preventDefault).toHaveBeenCalled();
    expect(scrollToMock).toHaveBeenCalledWith({ top: 0, behavior: 'smooth' });
  });

  it('shows section links on the landing page', () => {
    mockPath = '/';

    render(
      <Layout>
        <div>content</div>
      </Layout>,
    );

    expect(screen.getByText('المميزات')).toBeDefined();
    expect(screen.getByText('كيف يعمل')).toBeDefined();
    expect(screen.getByText('أسعارنا')).toBeDefined();
  });

  it('hides section links on the contact page', () => {
    mockPath = '/contact';

    render(
      <Layout>
        <div>content</div>
      </Layout>,
    );

    expect(screen.queryByText('المميزات')).toBeNull();
    expect(screen.queryByText('كيف يعمل')).toBeNull();
    expect(screen.queryByText('أسعارنا')).toBeNull();
    // "تواصل معنا" should still be visible
    expect(screen.getByText('تواصل معنا')).toBeDefined();
  });

  it('hides section links on the trial page', () => {
    mockPath = '/trial';

    render(
      <Layout>
        <div>content</div>
      </Layout>,
    );

    expect(screen.queryByText('المميزات')).toBeNull();
    expect(screen.queryByText('كيف يعمل')).toBeNull();
    expect(screen.queryByText('أسعارنا')).toBeNull();
  });
});
