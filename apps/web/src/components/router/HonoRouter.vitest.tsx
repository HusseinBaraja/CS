import { createEvent, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Link, RouterProvider } from './HonoRouter';

describe('HonoRouter Link', () => {
  afterEach(() => {
    window.history.replaceState({}, '', '/');
    vi.restoreAllMocks();
  });

  it('forwards anchor props to the rendered element', () => {
    render(
      <RouterProvider>
        <Link
          href="/contact"
          aria-label="contact link"
          className="router-link"
          data-testid="router-link"
          rel="noopener"
          target="_self"
        >
          Contact
        </Link>
      </RouterProvider>,
    );

    const link = screen.getByTestId('router-link');

    expect(link.getAttribute('aria-label')).toBe('contact link');
    expect(link.getAttribute('class')).toContain('router-link');
    expect(link.getAttribute('rel')).toBe('noopener');
    expect(link.getAttribute('target')).toBe('_self');
  });

  it('lets non-document links use the browser default behavior', () => {
    const pushStateSpy = vi.spyOn(window.history, 'pushState');

    render(
      <RouterProvider>
        <Link href="mailto:test@example.com">Mail</Link>
      </RouterProvider>,
    );

    const link = screen.getByRole('link', { name: 'Mail' });
    const clickEvent = createEvent.click(link);
    clickEvent.preventDefault = vi.fn();

    fireEvent(link, clickEvent);

    expect(clickEvent.preventDefault).not.toHaveBeenCalled();
    expect(pushStateSpy).not.toHaveBeenCalled();

    pushStateSpy.mockRestore();
  });

  it('lets download links use the browser default behavior', () => {
    const pushStateSpy = vi.spyOn(window.history, 'pushState');

    render(
      <RouterProvider>
        <Link href="/brochure.pdf" download>
          Download
        </Link>
      </RouterProvider>,
    );

    const link = screen.getByRole('link', { name: 'Download' });
    const clickEvent = createEvent.click(link);
    clickEvent.preventDefault = vi.fn();

    fireEvent(link, clickEvent);

    expect(clickEvent.preventDefault).not.toHaveBeenCalled();
    expect(pushStateSpy).not.toHaveBeenCalled();

    pushStateSpy.mockRestore();
  });

  it('updates history for hash-only links while preserving scroll behavior', () => {
    const section = document.createElement('div');
    section.id = 'pricing';
    section.scrollIntoView = vi.fn();
    document.body.appendChild(section);

    const pushStateSpy = vi.spyOn(window.history, 'pushState');
    const rafSpy = vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb: FrameRequestCallback) => {
      cb(0);
      return 0;
    });

    render(
      <RouterProvider>
        <Link href="#pricing">Pricing</Link>
      </RouterProvider>,
    );

    fireEvent.click(screen.getByRole('link', { name: 'Pricing' }));

    expect(pushStateSpy).toHaveBeenCalledWith({}, '', '/#pricing');
    expect(section.scrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth' });

    rafSpy.mockRestore();
    section.remove();
  });

  it('updates history for same-path hash navigations', () => {
    const section = document.createElement('div');
    section.id = 'pricing';
    section.scrollIntoView = vi.fn();
    document.body.appendChild(section);
    window.history.replaceState({}, '', '/contact');

    const pushStateSpy = vi.spyOn(window.history, 'pushState');
    const rafSpy = vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb: FrameRequestCallback) => {
      cb(0);
      return 0;
    });

    render(
      <RouterProvider>
        <Link href="#pricing">Pricing</Link>
      </RouterProvider>,
    );

    fireEvent.click(screen.getByRole('link', { name: 'Pricing' }));

    expect(pushStateSpy).toHaveBeenCalledWith({}, '', '/contact#pricing');
    expect(section.scrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth' });

    rafSpy.mockRestore();
    section.remove();
  });

  it('updates history for same-origin links that include a hash', () => {
    const section = document.createElement('div');
    section.id = 'pricing';
    section.scrollIntoView = vi.fn();
    document.body.appendChild(section);

    const pushStateSpy = vi.spyOn(window.history, 'pushState');
    const rafSpy = vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb: FrameRequestCallback) => {
      cb(0);
      return 0;
    });

    render(
      <RouterProvider>
        <Link href="/#pricing">Pricing</Link>
      </RouterProvider>,
    );

    fireEvent.click(screen.getByRole('link', { name: 'Pricing' }));

    expect(pushStateSpy).toHaveBeenCalledWith({}, '', '/#pricing');
    expect(section.scrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth' });

    rafSpy.mockRestore();
    section.remove();
  });
});
