import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { setupGsapMocks } from './test/setupGsapMocks';

vi.mock('./components/layout/Layout', () => ({
  Layout: ({ children }: { children: React.ReactNode }) => <div data-testid="marketing-layout">{children}</div>,
}));

vi.mock('./components/ui/tooltip', () => ({
  TooltipProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('./pages/LandingPage', () => ({
  LandingPage: () => <div>landing-page</div>,
}));

vi.mock('./pages/ContactPage', () => ({
  ContactPage: () => <div>contact-page</div>,
}));

vi.mock('./pages/TrialPage', () => ({
  TrialPage: () => <div>trial-page</div>,
}));

vi.mock('./pages/DashboardPage', () => ({
  DashboardPage: () => <div>dashboard-page</div>,
}));

vi.mock('./pages/UploadDataPage', () => ({
  UploadDataPage: () => <div>upload-data-page</div>,
}));

describe('App shell layout behavior', () => {
  afterEach(() => {
    window.history.replaceState({}, '', '/');
    vi.resetModules();
    vi.clearAllMocks();
    cleanup();
  });

  it('wraps non-dashboard routes in marketing layout', async () => {
    setupGsapMocks();
    window.history.replaceState({}, '', '/contact');
    const { default: App } = await import('./App');

    render(<App />);

    screen.getByTestId('marketing-layout');
    screen.getByText('contact-page');
  });

  it('does not wrap nested dashboard paths in marketing layout', async () => {
    setupGsapMocks();
    window.history.replaceState({}, '', '/dashboard/upload');
    const { default: App } = await import('./App');

    render(<App />);

    expect(screen.queryByTestId('marketing-layout')).toBeNull();
    screen.getByText('upload-data-page');
  });
});
