import { createEvent, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Link, RouterProvider } from './HonoRouter';

describe('HonoRouter Link', () => {
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
});
