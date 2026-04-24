import { render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setupGsapMocks } from '../../test/setupGsapMocks';

describe('TrustSection', () => {
  const matchMediaMock = vi.fn<(query: string) => MediaQueryList>();
  const originalMatchMedia = window.matchMedia;

  const createMatchMediaResult = (matches: boolean): MediaQueryList =>
    ({
      matches,
      media: '(prefers-reduced-motion: reduce)',
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }) as MediaQueryList;

  beforeEach(() => {
    matchMediaMock.mockReset();
    matchMediaMock.mockReturnValue(createMatchMediaResult(false));
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

  it('renders the second glow with a dedicated selector and without inert inline animation styles', async () => {
    setupGsapMocks();

    const { TrustSection } = await import('./TrustSection');
    const { container } = render(<TrustSection />);

    const reverseGlow = container.querySelector('.ambient-glow-reverse');

    expect(reverseGlow).not.toBeNull();
    expect(reverseGlow?.getAttribute('style')).toBeNull();
    expect(container.querySelectorAll('.ambient-glow')).toHaveLength(1);
    expect(container.querySelectorAll('.trust-visual-container')).toHaveLength(1);
  });

  it('disables ambient rotation and continuous CSS animations when reduced motion is requested', async () => {
    matchMediaMock.mockReturnValue(createMatchMediaResult(true));

    const { gsapTo } = setupGsapMocks();
    const { TrustSection } = await import('./TrustSection');
    const { container } = render(<TrustSection />);

    const ambientGlow = container.querySelector('.ambient-glow');
    const reverseGlow = container.querySelector('.ambient-glow-reverse');

    expect(gsapTo).not.toHaveBeenCalledWith(ambientGlow, expect.any(Object));
    expect(gsapTo).not.toHaveBeenCalledWith(reverseGlow, expect.any(Object));

    const flowPackets = container.querySelectorAll<HTMLElement>('.trust-flow-packet');
    const pipelinePings = container.querySelectorAll<HTMLElement>('.trust-pipeline-ping');
    const zapPulse = container.querySelector<HTMLElement>('.trust-zap-pulse');
    const availabilityPulse = container.querySelector<HTMLElement>('.trust-availability-pulse');

    expect(flowPackets.length).toBeGreaterThan(0);
    flowPackets.forEach((flowPacket) => {
      expect(flowPacket.className).not.toContain('animate-');
    });

    expect(pipelinePings.length).toBeGreaterThan(0);
    pipelinePings.forEach((pipelinePing) => {
      expect(pipelinePing.className).not.toContain('animate-');
    });

    expect(zapPulse).not.toBeNull();
    expect(zapPulse?.className).not.toContain('animate-');
    expect(availabilityPulse).not.toBeNull();
    expect(availabilityPulse?.className).not.toContain('animate-');
  });

  it('configures GSAP tweens for both ambient glow variants and targets the rendered visual ref', async () => {
    const { gsapFrom, gsapResolvedTo, gsapTimeline, gsapTo } = setupGsapMocks();

    const { TrustSection } = await import('./TrustSection');
    const { container } = render(<TrustSection />);
    const ambientGlow = container.querySelector('.ambient-glow');
    const reverseGlow = container.querySelector('.ambient-glow-reverse');
    const visualContainer = container.querySelector('.trust-visual-container');

    expect(gsapTo).toHaveBeenCalledWith(
      ambientGlow,
      expect.objectContaining({
        rotate: 360,
        duration: 25,
        repeat: -1,
        ease: 'linear',
      }),
    );

    expect(gsapTo).toHaveBeenCalledWith(
      reverseGlow,
      expect.objectContaining({
        rotate: -360,
        duration: 30,
        repeat: -1,
        ease: 'linear',
      }),
    );
    expect(gsapFrom).toHaveBeenCalled();
    expect(gsapTimeline).toHaveBeenCalled();
    expect(gsapResolvedTo).toHaveBeenCalledWith([ambientGlow], expect.any(Object));
    expect(gsapResolvedTo).toHaveBeenCalledWith([reverseGlow], expect.any(Object));
    expect(gsapTimeline).toHaveBeenCalledWith(
      expect.objectContaining({
        scrollTrigger: expect.objectContaining({
          trigger: visualContainer,
        }),
      }),
    );
  });
});
