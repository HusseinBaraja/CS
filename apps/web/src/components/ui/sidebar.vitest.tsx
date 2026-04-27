import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { Sidebar, SidebarProvider, SidebarRail } from './sidebar';

vi.mock('@/hooks/use-mobile', () => ({
  useIsMobile: () => false,
}));

describe('SidebarRail', () => {
  afterEach(() => {
    cleanup();
  });

  it('uses semantic sidebar rail tokens and avoids literal color values', () => {
    render(
      <SidebarProvider>
        <Sidebar>
          <SidebarRail />
        </Sidebar>
      </SidebarProvider>,
    );

    const rail = screen.getByRole('button', { name: 'Toggle Sidebar' });
    const className = rail.getAttribute('class') ?? '';

    expect(className).toContain('bg-sidebar-rail/55');
    expect(className).toContain('text-sidebar-rail-foreground');
    expect(className).toContain('border-sidebar-rail-border');
    expect(className).toContain('hover:bg-sidebar-rail-hover');
    expect(className).toContain('focus-visible:ring-sidebar-rail-ring/35');
    expect(className).toContain('hover:shadow-[var(--sidebar-rail-shadow)]');

    expect(className).not.toContain('bg-white/55');
    expect(className).not.toContain('#0a9a4b');
    expect(className).not.toContain('rgba(');
  });
});
