import { useLayoutEffect } from 'react';
import { vi } from 'vitest';

export function setupGsapMocks() {
  const gsapTo = vi.fn();
  const gsapFrom = vi.fn();
  const gsapFromTo = vi.fn();
  const gsapSet = vi.fn();
  const gsapTimeline = vi.fn(() => ({
    from: vi.fn().mockReturnThis(),
  }));
  const gsapToArray = vi.fn(() => []);

  vi.doMock('gsap', () => ({
    default: {
      registerPlugin: vi.fn(),
      to: gsapTo,
      from: gsapFrom,
      fromTo: gsapFromTo,
      set: gsapSet,
      timeline: gsapTimeline,
      utils: {
        toArray: gsapToArray,
      },
    },
  }));

  vi.doMock('@gsap/react', () => ({
    useGSAP: (func?: unknown) => {
      useLayoutEffect(() => {
        if (typeof func === 'function') {
          func();
        }
      }, []);

      return {
        contextSafe: <T extends (...args: never[]) => unknown>(callback: T) => callback,
      };
    },
  }));

  vi.doMock('gsap/ScrollTrigger', () => ({
    ScrollTrigger: {},
  }));

  return {
    gsapTo,
    gsapFrom,
    gsapFromTo,
    gsapSet,
    gsapTimeline,
    gsapToArray,
  };
}
