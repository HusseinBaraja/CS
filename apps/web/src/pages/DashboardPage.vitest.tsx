import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import logoUrl from '../assets/logo.svg';
import { Sidebar, SidebarProvider } from '../components/ui/sidebar';
import { DashboardPage } from './DashboardPage';

const SIDEBAR_COLLAPSE_DURATION_MS = 200;

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

  afterEach(() => {
    vi.useRealTimers();
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

  it('marks decorative dashboard images as hidden from assistive tech', () => {
    const { container } = render(<DashboardPage />);

    const decorativeImages = container.querySelectorAll('img[alt=""][aria-hidden="true"]');

    expect(decorativeImages.length).toBeGreaterThanOrEqual(2);
  });

  it('keeps dashboard navigation icons on the right with constrained labels', () => {
    const { container } = render(<DashboardPage />);

    const aiLabel = screen.getAllByText('تخصيص الذكاء الاصطناعي')[0];
    const navLink = aiLabel.closest('a');
    const scrollArea = container.querySelector('[data-slot="scroll-area"]');
    const overflowShadow = container.querySelector('[data-testid="sidebar-bottom-overflow-shadow"]');

    expect(scrollArea?.getAttribute('class')).toContain('**:data-[slot=scroll-area-scrollbar]:left-0');
    expect(scrollArea?.getAttribute('class')).toContain('**:data-[slot=scroll-area-scrollbar]:right-auto');
    expect(scrollArea?.getAttribute('class')).toContain('**:data-[slot=scroll-area-viewport]:pl-3');
    expect(overflowShadow?.getAttribute('class')).toContain('pointer-events-none');
    expect(overflowShadow?.getAttribute('class')).toContain('bottom-0');
    expect(overflowShadow?.getAttribute('class')).toContain('transition-opacity');
    expect(navLink?.getAttribute('class')).toContain('grid-cols-[minmax(0,1fr)_1.25rem]');
    expect(aiLabel.getAttribute('class')).toContain('overflow-hidden');
    expect(aiLabel.getAttribute('class')).toContain('wrap-break-word');
    expect(aiLabel.getAttribute('class')).toContain('group-data-[icon-layout=collapsed]:hidden');
  });

  it('enlarges docked nav icons and padding without changing stroke weight', () => {
    const { container } = render(<DashboardPage />);

    const dashboardLabel = screen.getAllByText('لوحة التحكم')[0];
    const navLink = dashboardLabel.closest('a');
    const navButton = dashboardLabel.closest('[data-sidebar="menu-button"]');
    const navItem = dashboardLabel.closest('[data-sidebar="menu-item"]');
    const sidebarContent = container.querySelector('[data-sidebar="content"]');
    const sidebarGroup = container.querySelector('[data-sidebar="group"]');
    const scrollArea = container.querySelector('[data-slot="scroll-area"]');
    const navIcon = navLink?.querySelector('svg');

    expect(sidebarContent?.getAttribute('class')).toContain('group-data-[icon-layout=collapsed]:px-0');
    expect(scrollArea?.getAttribute('class')).toContain('group-data-[icon-layout=collapsed]:**:data-[slot=scroll-area-viewport]:pl-0');
    expect(sidebarGroup?.getAttribute('class')).toContain('group-data-[icon-layout=collapsed]:p-0');
    expect(navButton?.getAttribute('class')).toContain('group-data-[icon-layout=collapsed]:size-12');
    expect(navButton?.getAttribute('class')).toContain('group-data-[icon-layout=collapsed]:p-3');
    expect(navButton?.getAttribute('class')).toContain('group-data-[icon-layout=collapsed]:[&_svg]:size-6');
    expect(navButton?.getAttribute('class')).toContain('group-data-[icon-layout=collapsed]:rounded-lg');
    expect(navButton?.getAttribute('class')).toContain('transition-[width,height,padding]');
    expect(navButton?.getAttribute('class')).not.toContain('group-data-[collapsible=icon]:size-12');
    expect(navItem?.getAttribute('class')).toContain('group-data-[icon-layout=collapsed]:flex');
    expect(navItem?.getAttribute('class')).toContain('group-data-[icon-layout=collapsing]:justify-end');
    expect(navItem?.getAttribute('class')).toContain('group-data-[icon-layout=collapsed]:justify-center');
    expect(navItem?.getAttribute('class')).not.toContain('group-data-[collapsible=icon]:justify-end');
    expect(navLink?.getAttribute('class')).toContain('group-data-[icon-layout=collapsed]:grid-cols-1');
    expect(navLink?.getAttribute('class')).toContain('group-data-[icon-layout=collapsed]:justify-items-center');
    expect(navIcon?.getAttribute('class')).toContain('group-data-[icon-layout=collapsed]:justify-self-center');
    expect(navIcon?.getAttribute('class')).toContain('stroke-[1.9]');
  });

  it('delays collapsed icon centering until the sidebar rail finishes collapsing', async () => {
    vi.useFakeTimers();
    const { container } = render(<DashboardPage />);

    const trigger = container.querySelector('[data-slot="sidebar-trigger"]');
    expect(trigger).toBeDefined();
    fireEvent.click(trigger as Element);

    const sidebar = container.querySelector('[data-slot="sidebar"][data-collapsible="icon"]');
    expect(sidebar?.getAttribute('data-icon-layout')).toBe('collapsing');

    act(() => {
      vi.advanceTimersByTime(SIDEBAR_COLLAPSE_DURATION_MS);
    });

    expect(sidebar?.getAttribute('data-icon-layout')).toBe('collapsed');
  });

  it('sets collapsed icon layout immediately when mounted collapsed', () => {
    const { container } = render(
      <SidebarProvider defaultOpen={false}>
        <Sidebar collapsible="icon" />
      </SidebarProvider>
    );

    const sidebar = container.querySelector('[data-slot="sidebar"][data-collapsible="icon"]');

    expect(sidebar?.getAttribute('data-icon-layout')).toBe('collapsed');
    expect(sidebar?.getAttribute('data-icon-layout')).not.toBe('collapsing');
  });

  it('keeps placeholder sidebar navigation visually enabled', () => {
    render(<DashboardPage />);

    const dashboardLabel = screen.getAllByText('لوحة التحكم')[0];
    const navLink = dashboardLabel.closest('a');
    const navButton = dashboardLabel.closest('[data-sidebar="menu-button"]');

    expect(navLink?.getAttribute('aria-disabled')).toBeNull();
    expect(navLink?.getAttribute('data-placeholder')).toBe('true');
    expect(navButton?.getAttribute('class')).toContain('data-active:text-[#087a43]');
  });

  it('fades the sidebar overflow shadow after navigation scroll starts', async () => {
    const { container } = render(<DashboardPage />);

    const viewport = container.querySelector('[data-slot="scroll-area-viewport"]');
    expect(viewport).not.toBeNull();
    const overflowShadow = container.querySelector('[data-testid="sidebar-bottom-overflow-shadow"]');

    expect(overflowShadow?.getAttribute('data-visible')).toBe('true');

    fireEvent.scroll(viewport!, { target: { scrollTop: 12 } });

    await waitFor(() => {
      expect(overflowShadow?.getAttribute('data-visible')).toBe('false');
    });
  });

  it('keeps header, sidebar, and content inset synced with shared header height', () => {
    const { container } = render(<DashboardPage />);

    const header = container.querySelector('header');
    const sidebar = container.querySelector('[data-slot="sidebar-container"]');
    const inset = container.querySelector('[data-slot="sidebar-inset"]');

    expect(header?.getAttribute('class')).toContain('h-[var(--header-height)]');
    expect(sidebar?.getAttribute('class')).toContain('top-[var(--header-height)]');
    expect(sidebar?.getAttribute('class')).toContain('h-[calc(100svh-var(--header-height))]');
    expect(inset?.getAttribute('class')).toContain('pt-[var(--header-height)]');
  });

  it('uses a full-height sidebar rail as the collapse target', () => {
    const { container } = render(<DashboardPage />);

    const rail = container.querySelector('[data-sidebar="rail"]');
    if (!rail) {
      throw new Error('Sidebar rail was not rendered');
    }

    const railIcon = rail.querySelector('svg');
    const railIconShell = railIcon?.parentElement;

    expect(rail.getAttribute('data-sidebar')).toBe('rail');
    expect(rail.getAttribute('data-state')).toBe('expanded');
    expect(rail.getAttribute('tabindex')).toBeNull();
    expect(rail.getAttribute('class')).toContain('inset-y-0');
    expect(rail.getAttribute('class')).toContain('w-7');
    expect(rail.getAttribute('class')).toContain('cursor-pointer');
    expect(rail.getAttribute('class')).not.toContain('cursor-e-resize');
    expect(rail.getAttribute('class')).not.toContain('cursor-w-resize');
    expect(rail.getAttribute('class')).toContain('group-data-[side=right]:border-l');
    expect(rail.getAttribute('class')).toContain('group-data-[side=right]:left-0');
    expect(rail.getAttribute('class')).toContain('group-data-[side=right]:-translate-x-full');
    expect(rail.getAttribute('class')).toContain('items-center');
    expect(rail.getAttribute('class')).toContain('justify-center');
    expect(railIconShell?.getAttribute('class')).toContain('size-7');
    expect(railIconShell?.getAttribute('class')).toContain('group-data-[state=collapsed]:rotate-180');
    expect(railIcon?.getAttribute('class')).toContain('size-5');

    fireEvent.click(rail);

    const sidebar = container.querySelector('[data-slot="sidebar"][data-state]');
    expect(sidebar?.getAttribute('data-state')).toBe('collapsed');
  });
});
