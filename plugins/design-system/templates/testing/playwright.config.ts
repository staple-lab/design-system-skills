import { defineConfig } from '@playwright/test';

/**
 * Visual regression against the inventory site.
 *
 * The inventory is the one place every component already renders in every theme, so it
 * doubles as the VRT surface for free — no separate story files to keep in sync. The
 * spec in ./vrt derives its page list from `.design-system/registry.json`, which means
 * a new component is covered the moment it is registered.
 *
 * Baselines are platform-specific (the default snapshot name carries an -linux/-darwin
 * suffix, because font rasterisation differs). Generate them where CI runs:
 *
 *   npx playwright test --update-snapshots        # locally, for your own platform
 *   # for CI baselines, run the same inside the Playwright Linux image, or download
 *   # the vrt-diffs artifact from the first CI run and commit the "actual" images.
 */
export default defineConfig({
  testDir: './vrt',
  testMatch: '**/*.vrt.spec.ts',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  // No retries: a real visual diff is deterministic — if it fails once it fails every
  // time. A retry only papers over an unstable page (animation still running, data not
  // awaited), and that instability belongs fixed, not hidden.
  retries: 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : [['list']],

  expect: {
    toHaveScreenshot: {
      // Rewinds CSS animations/transitions to their end state before the shot.
      animations: 'disabled',
      caret: 'hide',
    },
  },

  use: {
    // inventory/vite.config.ts sets server.port — keep the two in sync.
    baseURL: 'http://localhost:6006',
    viewport: { width: 1280, height: 800 },
    deviceScaleFactor: 1,
    // Belt to the braces above: pages honouring prefers-reduced-motion render their
    // static variant, so nothing is mid-flight when the screenshot fires.
    reducedMotion: 'reduce',
    timezoneId: 'UTC',
    locale: 'en-US',
  },

  projects: [
    // Chromium only by default. Adding webkit/firefox triples snapshot count, CI time
    // and baseline maintenance — and most regressions VRT catches (a token change, a
    // spacing bug, a broken theme) render identically in all three engines. Add the
    // other engines only if you ship engine-specific CSS worth that cost.
    { name: 'chromium', use: { browserName: 'chromium' } },
    // { name: 'webkit', use: { browserName: 'webkit' } },
    // { name: 'firefox', use: { browserName: 'firefox' } },
  ],

  webServer: {
    command: 'npm run inventory',
    url: 'http://localhost:6006',
    reuseExistingServer: !process.env.CI,
    // The inventory config sets `open: true`; BROWSER=none stops vite popping a tab
    // (or erroring on a headless CI machine).
    env: { BROWSER: 'none' },
  },
});
