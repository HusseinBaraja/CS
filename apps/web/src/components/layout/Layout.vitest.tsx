import { cleanup, createEvent, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Layout } from './Layout';

const contextRevertMock = vi.fn();

// Mock gsap for JSDOM environment
vi.mock('gsap', () => ({
  default: {
    set: vi.fn(),
    to: vi.fn(),
    context: vi.fn(() => ({
      revert: contextRevertMock,
    })),
  },
}));

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
    contextRevertMock.mockReset();
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

  it('always renders section links in the DOM', () => {
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

  it('renders section links even on non-landing pages (animated via GSAP)', () => {
    mockPath = '/contact';

    render(
      <Layout>
        <div>content</div>
      </Layout>,
    );

    // Links are always in the DOM (animated out visually, not removed)
    expect(screen.getByText('المميزات')).toBeDefined();
    expect(screen.getByText('كيف يعمل')).toBeDefined();
    expect(screen.getByText('أسعارنا')).toBeDefined();
    // "تواصل معنا" should still be visible
    expect(screen.getByText('تواصل معنا')).toBeDefined();
  });

  it('sets pointer-events none on section links container for non-landing pages', () => {
    mockPath = '/contact';

    render(
      <Layout>
        <div>content</div>
      </Layout>,
    );

    const container = screen.getByText('المميزات').closest('div');
    expect(container?.style.pointerEvents).toBe('none');
  });

  it('reverts GSAP context on unmount', () => {
    const { unmount } = render(
      <Layout>
        <div>content</div>
      </Layout>,
    );

    unmount();

    expect(contextRevertMock).toHaveBeenCalled();
  });
});
