import { act, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setupGsapMocks } from '../../test/setupGsapMocks';

describe('SolutionSection', () => {
  const matchMediaMock = vi.fn<(query: string) => MediaQueryList>();
  const originalMatchMedia = window.matchMedia;
  const originalInnerWidth = window.innerWidth;

  beforeEach(() => {
    matchMediaMock.mockReset();
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: matchMediaMock,
    });
    Object.defineProperty(window, 'innerWidth', {
      writable: true,
      configurable: true,
      value: originalInnerWidth,
    });
  });

  afterEach(() => {
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: originalMatchMedia,
    });
    Object.defineProperty(window, 'innerWidth', {
      writable: true,
      configurable: true,
      value: originalInnerWidth,
    });
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  it('disables GSAP and CSS artwork animations when reduced motion is requested', async () => {
    matchMediaMock.mockReturnValue({
      matches: true,
      media: '(prefers-reduced-motion: reduce)',
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    });

    const { gsapSet, gsapTo, gsapFrom, gsapFromTo } = setupGsapMocks();
    const { SolutionSection } = await import('./SolutionSection');
    const { container } = render(<SolutionSection />);

    expect(gsapSet).not.toHaveBeenCalled();
    expect(gsapTo).not.toHaveBeenCalledWith('.ambient-gradient', expect.any(Object));
    expect(gsapTo).not.toHaveBeenCalledWith('.ring-element:not(.ring-element--middle)', expect.any(Object));
    expect(gsapTo).not.toHaveBeenCalledWith('.ring-element--middle', expect.any(Object));
    expect(gsapTo).not.toHaveBeenCalledWith('.floating-core', expect.any(Object));
    expect(gsapFrom).not.toHaveBeenCalled();
    expect(gsapFromTo).not.toHaveBeenCalled();

    const pulsingGlow = container.querySelector('.solution-pulse-glow');
    const spinningDiamond = container.querySelector('.solution-spinning-diamond');
    const pingBorder = container.querySelector('.solution-ping-border');
    const orbitWrapper = container.querySelector('.solution-orbit-wrapper');

    expect(pulsingGlow?.className).not.toContain('animate-');
    expect(spinningDiamond?.className).not.toContain('animate-');
    expect(pingBorder?.className).not.toContain('animate-');
    expect(orbitWrapper?.className).not.toContain('animate-');
    expect(container.querySelector('.ed-number')).toBeNull();
    expect(container.textContent ?? '').not.toMatch(/\b01\b|\b02\b|\b03\b|\b04\b/);
  });

  it('configures forward and reverse ring tweens and uses desktop floating amplitude by default', async () => {
    matchMediaMock.mockReturnValue({
      matches: false,
      media: '(prefers-reduced-motion: reduce)',
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    });
    Object.defineProperty(window, 'innerWidth', {
      writable: true,
      configurable: true,
      value: 1024,
    });

    const { gsapFromTo, gsapTo, gsapToArray } = setupGsapMocks();
    const { SolutionSection } = await import('./SolutionSection');
    const { container } = render(<SolutionSection />);

    expect(gsapTo).toHaveBeenCalledWith(
      '.ring-element:not(.ring-element--middle)',
      expect.objectContaining({
        rotate: 360,
        duration: 40,
        repeat: -1,
        ease: 'linear',
      }),
    );

    expect(gsapTo).toHaveBeenCalledWith(
      '.ring-element--middle',
      expect.objectContaining({
        rotate: -360,
        duration: 60,
        repeat: -1,
        ease: 'linear',
      }),
    );

    const middleRing = container.querySelector('.ring-element--middle');

    expect(middleRing).not.toBeNull();
    expect(middleRing?.getAttribute('style')).toBeNull();
    expect(gsapFromTo).toHaveBeenCalledWith(
      '.floating-core',
      { y: 14 },
      expect.objectContaining({
        y: -14,
        duration: 3,
        repeat: -1,
        yoyo: true,
        ease: 'sine.inOut',
      }),
    );
    expect(gsapToArray).not.toHaveBeenCalledWith('.ed-number');
    expect(container.querySelector('.ed-number')).toBeNull();
    expect(container.textContent ?? '').not.toMatch(/\b01\b|\b02\b|\b03\b|\b04\b/);
  });

  it('recreates the floating-core tween when resize crosses the mobile breakpoint and cleans it up on unmount', async () => {
    vi.useFakeTimers();
    matchMediaMock.mockReturnValue({
      matches: false,
      media: '(prefers-reduced-motion: reduce)',
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    });
    Object.defineProperty(window, 'innerWidth', {
      writable: true,
      configurable: true,
      value: 640,
    });

    const { gsapFromTo } = setupGsapMocks();
    const { SolutionSection } = await import('./SolutionSection');
    const { unmount } = render(<SolutionSection />);

    expect(gsapFromTo).toHaveBeenNthCalledWith(
      1,
      '.floating-core',
      { y: 8 },
      expect.objectContaining({
        y: -8,
      }),
    );

    Object.defineProperty(window, 'innerWidth', {
      writable: true,
      configurable: true,
      value: 1024,
    });

    act(() => {
      window.dispatchEvent(new Event('resize'));
      vi.advanceTimersByTime(160);
    });

    expect(gsapFromTo).toHaveBeenCalledTimes(2);
    const firstFloatingTween = gsapFromTo.mock.results[0]?.value;
    const secondFloatingTween = gsapFromTo.mock.results[1]?.value;

    expect(firstFloatingTween).toBeDefined();
    expect(secondFloatingTween).toBeDefined();
    expect(firstFloatingTween?.kill).toHaveBeenCalledTimes(1);
    expect(secondFloatingTween?.kill).not.toHaveBeenCalled();
    expect(gsapFromTo).toHaveBeenNthCalledWith(
      2,
      '.floating-core',
      { y: 14 },
      expect.objectContaining({
        y: -14,
      }),
    );

    unmount();

    expect(secondFloatingTween?.kill).toHaveBeenCalledTimes(1);
  });
});
