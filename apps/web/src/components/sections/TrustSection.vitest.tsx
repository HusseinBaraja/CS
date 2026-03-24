import { render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { setupGsapMocks } from '../../test/setupGsapMocks';

describe('TrustSection', () => {
  afterEach(() => {
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
  });

  it('configures GSAP tweens for both ambient glow variants', async () => {
    const { gsapFrom, gsapResolvedTo, gsapTimeline, gsapTo } = setupGsapMocks();

    const { TrustSection } = await import('./TrustSection');
    const { container } = render(<TrustSection />);
    const ambientGlow = container.querySelector('.ambient-glow');
    const reverseGlow = container.querySelector('.ambient-glow-reverse');

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
    expect(gsapResolvedTo).toHaveBeenCalledWith([ambientGlow], expect.any(Object));
    expect(gsapResolvedTo).toHaveBeenCalledWith([reverseGlow], expect.any(Object));
  });
});
