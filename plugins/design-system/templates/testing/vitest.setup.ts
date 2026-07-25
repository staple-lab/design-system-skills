import '@testing-library/jest-dom/vitest';
import * as matchers from 'vitest-axe/matchers';
import { expect, afterEach, beforeAll, vi } from 'vitest';
import { cleanup } from '@testing-library/react';

expect.extend(matchers);

afterEach(cleanup);

beforeAll(() => {
  /**
   * jsdom implements neither of these, and both are load-bearing in a design system:
   * every primitive library queries matchMedia for reduced motion, and every floating
   * element (popover, tooltip, menu) uses ResizeObserver for positioning. Without the
   * stubs, components throw during render and the failure looks unrelated to the cause.
   */
  vi.stubGlobal(
    'matchMedia',
    vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  );

  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );

  // Radix/Base UI use these for scroll locking and pointer-based dismissal.
  Element.prototype.scrollIntoView = vi.fn();
  Element.prototype.hasPointerCapture = vi.fn(() => false);
  Element.prototype.setPointerCapture = vi.fn();
  Element.prototype.releasePointerCapture = vi.fn();
});

/**
 * jsdom computes no styles from a real cascade, so axe's colour-contrast rule cannot run
 * here and reports nothing rather than passing. Contrast is gated properly in the TOKEN
 * BUILD, where the values are actually known — do not re-implement it in jsdom and do not
 * assume a green axe run covered it.
 */
