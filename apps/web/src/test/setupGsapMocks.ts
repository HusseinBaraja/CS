import { useLayoutEffect } from 'react';
import { vi } from 'vitest';

type GsapScope = ParentNode | { current: ParentNode | null } | null | undefined;
type GsapConfig = { scope?: GsapScope };
type GsapCallback = (() => void) | undefined;
type GsapTarget =
  | string
  | Element
  | null
  | undefined
  | ArrayLike<Element>
  | Element[];

type TimelineInstance = {
  from: ReturnType<typeof vi.fn<(target: GsapTarget, vars?: object) => TimelineInstance>>;
};

const timelineInstance = {} as TimelineInstance;
timelineInstance.from = vi.fn<(target: GsapTarget, vars?: object) => TimelineInstance>();

const gsapResolvedTo = vi.fn<(targets: Element[], vars?: object) => void>();
const gsapResolvedFrom = vi.fn<(targets: Element[], vars?: object) => void>();
const gsapResolvedFromTo = vi.fn<(targets: Element[], fromVars?: object, toVars?: object) => void>();
const gsapTo = vi.fn<(target: GsapTarget, vars?: object) => void>();
const gsapFrom = vi.fn<(target: GsapTarget, vars?: object) => void>();
const gsapFromTo = vi.fn<(target: GsapTarget, fromVars?: object, toVars?: object) => void>();
const gsapSet = vi.fn<(target: GsapTarget, vars?: object) => void>();
const gsapTimeline = vi.fn<(vars?: object) => typeof timelineInstance>();
const gsapToArray = vi.fn<(target: GsapTarget) => Element[]>();

let currentScope: ParentNode = document;

function canQuery(value: ParentNode): value is ParentNode & {
  querySelectorAll(selectors: string): NodeListOf<Element>;
} {
  return typeof (value as ParentNode & { querySelectorAll?: unknown }).querySelectorAll === 'function';
}

function resolveScope(scope: GsapScope): ParentNode {
  if (!scope) {
    return document;
  }

  if ('current' in scope) {
    return scope.current ?? document;
  }

  return scope;
}

function isArrayLike(value: unknown): value is ArrayLike<Element> {
  return (
    typeof value === 'object' &&
    value !== null &&
    'length' in value &&
    typeof (value as { length: unknown }).length === 'number'
  );
}

function resolveTargets(target: GsapTarget): Element[] {
  if (!target) {
    return [];
  }

  if (typeof target === 'string') {
    if (!canQuery(currentScope)) {
      return [];
    }

    return Array.from(currentScope.querySelectorAll(target));
  }

  if (Array.isArray(target)) {
    return target;
  }

  if (isArrayLike(target)) {
    return Array.from(target);
  }

  return [target];
}

function resetGsapMocks() {
  currentScope = document;

  timelineInstance.from.mockReset();
  timelineInstance.from.mockImplementation(() => timelineInstance);

  gsapResolvedTo.mockReset();
  gsapResolvedFrom.mockReset();
  gsapResolvedFromTo.mockReset();

  gsapTo.mockReset();
  gsapTo.mockImplementation((target, vars) => {
    gsapResolvedTo(resolveTargets(target), vars);
  });

  gsapFrom.mockReset();
  gsapFrom.mockImplementation((target, vars) => {
    gsapResolvedFrom(resolveTargets(target), vars);
  });

  gsapFromTo.mockReset();
  gsapFromTo.mockImplementation((target, fromVars, toVars) => {
    gsapResolvedFromTo(resolveTargets(target), fromVars, toVars);
  });

  gsapSet.mockReset();
  gsapTimeline.mockReset();
  gsapTimeline.mockImplementation(() => timelineInstance);

  gsapToArray.mockReset();
  gsapToArray.mockImplementation((target) => resolveTargets(target));
}

export function setupGsapMocks() {
  resetGsapMocks();

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
    useGSAP: (callback?: GsapCallback, config?: GsapConfig) => {
      useLayoutEffect(() => {
        if (typeof callback !== 'function') {
          return;
        }

        const previousScope = currentScope;
        currentScope = resolveScope(config?.scope);

        try {
          callback();
        } finally {
          currentScope = previousScope;
        }
      }, []);

      return {
        contextSafe: <T extends (...args: never[]) => unknown>(safeCallback: T) => safeCallback,
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
    gsapResolvedTo,
    gsapResolvedFrom,
    gsapResolvedFromTo,
  };
}
