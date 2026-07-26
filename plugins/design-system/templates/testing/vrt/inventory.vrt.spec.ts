import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';

/**
 * One screenshot per component page, plus foundations and tokens, in every theme.
 *
 * The page list comes from the registry at collection time, so nobody maintains it: a
 * component that reaches the registry is visually covered on its next CI run, and a
 * removed one stops producing orphan baselines.
 */

const registryPath = join(process.cwd(), '.design-system', 'registry.json');

let registry: { components: { name: string }[] };
try {
  registry = JSON.parse(readFileSync(registryPath, 'utf8'));
} catch {
  throw new Error(
    `No registry at ${registryPath} — run \`npm run registry\` first. The VRT suite derives its page list from it.`,
  );
}

const themes = ['light', 'dark'] as const;

async function openPage(page: Page, hash: string, theme: string): Promise<void> {
  // index.html applies the stored theme before first paint, so seeding localStorage is
  // exactly what a returning visitor looks like — no flash of the wrong theme, and no
  // post-load attribute flip for the screenshot to race.
  await page.addInitScript((t) => localStorage.setItem('ds-theme', t), theme);
  await page.goto(`/#/${hash}`);
  await page.locator('#main h1').first().waitFor();
  // Wait for webfonts, or the first run on a fresh machine diffs on fallback glyphs.
  await page.evaluate(() => document.fonts.ready);
}

for (const theme of themes) {
  test.describe(theme, () => {
    test('foundations', async ({ page }) => {
      await openPage(page, 'foundations', theme);
      await expect(page).toHaveScreenshot(`foundations-${theme}.png`, { fullPage: true });
    });

    test('tokens', async ({ page }) => {
      await openPage(page, 'tokens', theme);
      await expect(page).toHaveScreenshot(`tokens-${theme}.png`, { fullPage: true });
    });

    for (const { name } of registry.components) {
      test(`component: ${name}`, async ({ page }) => {
        await openPage(page, `component/${encodeURIComponent(name)}`, theme);
        await expect(page).toHaveScreenshot(`component-${name}-${theme}.png`, { fullPage: true });
      });
    }
  });
}
