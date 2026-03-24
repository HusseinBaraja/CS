import { render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setupGsapMocks } from '../../test/setupGsapMocks';

describe('SolutionSection', () => {
  const matchMediaMock = vi.fn<(query: string) => MediaQueryList>();
  const originalMatchMedia = window.matchMedia;

  beforeEach(() => {
    matchMediaMock.mockReset();
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: matchMediaMock,
    });
  });

  afterEach(() => {
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: originalMatchMedia,
    });
    vi.clearAllMocks();
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

    expect(gsapSet).toHaveBeenCalledWith('.ed-feature .ed-number', { y: 0, opacity: 0.1 });
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
  });

  it('configures forward and reverse ring tweens without inert middle ring styles', async () => {
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

    const { gsapResolvedFromTo, gsapTo, gsapToArray } = setupGsapMocks();
    const { SolutionSection } = await import('./SolutionSection');
    const { container } = render(<SolutionSection />);
    const numbers = Array.from(container.querySelectorAll('.ed-number'));

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
    const resolvedNumbers = gsapResolvedFromTo.mock.calls.flatMap(([targets]) => targets);

    expect(middleRing).not.toBeNull();
    expect(middleRing?.getAttribute('style')).toBeNull();
    expect(gsapToArray).toHaveBeenCalledWith('.ed-number');
    expect(resolvedNumbers).toEqual(numbers);
  });
});
