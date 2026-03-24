import { cleanup, createEvent, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Layout } from './Layout';

describe('Layout', () => {
  const scrollToMock = vi.fn();

  afterEach(() => {
    scrollToMock.mockReset();
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

  it('uses a top-level anchor with smooth scroll-to-top behavior', () => {
    Object.defineProperty(window, 'scrollTo', {
      value: scrollToMock,
      writable: true,
    });

    render(
      <Layout>
        <div>content</div>
      </Layout>,
    );

    const [navLogoLink] = screen.getAllByRole('link', { name: 'CSCB' });
    const clickEvent = createEvent.click(navLogoLink);
    clickEvent.preventDefault = vi.fn();

    expect(navLogoLink.getAttribute('href')).toBe('#');

    fireEvent(navLogoLink, clickEvent);

    expect(clickEvent.preventDefault).toHaveBeenCalled();
    expect(scrollToMock).toHaveBeenCalledWith({ top: 0, behavior: 'smooth' });
  });
});
