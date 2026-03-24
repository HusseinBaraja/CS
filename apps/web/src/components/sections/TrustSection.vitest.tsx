import { render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('TrustSection', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('renders the second glow with a dedicated selector and without inert inline animation styles', async () => {
    const gsapTo = vi.fn();
    const gsapFrom = vi.fn();
    const gsapTimeline = vi.fn(() => ({
      from: vi.fn().mockReturnThis(),
    }));

    vi.doMock('gsap', () => ({
      default: {
        registerPlugin: vi.fn(),
        to: gsapTo,
        from: gsapFrom,
        timeline: gsapTimeline,
      },
    }));
    vi.doMock('@gsap/react', () => ({
      useGSAP: (func?: unknown) => {
        if (typeof func === 'function') {
          func();
        }

        return {
          contextSafe: <T extends (...args: never[]) => unknown>(callback: T) => callback,
        };
      },
    }));
    vi.doMock('gsap/ScrollTrigger', () => ({
      ScrollTrigger: {},
    }));

    const { TrustSection } = await import('./TrustSection');
    const { container } = render(<TrustSection />);

    const reverseGlow = container.querySelector('.ambient-glow-reverse');

    expect(reverseGlow).not.toBeNull();
    expect(reverseGlow?.getAttribute('style')).toBeNull();
    expect(container.querySelectorAll('.ambient-glow')).toHaveLength(1);
  });

  it('configures GSAP tweens for both ambient glow variants', async () => {
    const gsapTo = vi.fn();
    const gsapFrom = vi.fn();
    const gsapTimeline = vi.fn(() => ({
      from: vi.fn().mockReturnThis(),
    }));

    vi.doMock('gsap', () => ({
      default: {
        registerPlugin: vi.fn(),
        to: gsapTo,
        from: gsapFrom,
        timeline: gsapTimeline,
      },
    }));
    vi.doMock('@gsap/react', () => ({
      useGSAP: (func?: unknown) => {
        if (typeof func === 'function') {
          func();
        }

        return {
          contextSafe: <T extends (...args: never[]) => unknown>(callback: T) => callback,
        };
      },
    }));
    vi.doMock('gsap/ScrollTrigger', () => ({
      ScrollTrigger: {},
    }));

    const { TrustSection } = await import('./TrustSection');
    render(<TrustSection />);

    expect(gsapTo).toHaveBeenCalledWith(
      '.ambient-glow',
      expect.objectContaining({
        rotate: 360,
        duration: 25,
        repeat: -1,
        ease: 'linear',
      }),
    );

    expect(gsapTo).toHaveBeenCalledWith(
      '.ambient-glow-reverse',
      expect.objectContaining({
        rotate: -360,
        duration: 30,
        repeat: -1,
        ease: 'linear',
      }),
    );
    expect(gsapFrom).toHaveBeenCalled();
    expect(gsapTimeline).toHaveBeenCalled();
  });
});
