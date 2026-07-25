import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: false, // explicit imports — clearer, and they survive a move to another runner
    setupFiles: ['./vitest.setup.ts'],
    css: true, // CSS Modules resolve, so `styles.button` is a class name and not undefined
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary', 'html'],
      include: ['src/design-system/**/*.{ts,tsx}'],
      exclude: ['**/*.stories.tsx', '**/*.test.tsx', '**/index.ts', '**/*.meta.json'],
      thresholds: {
        // Higher than a typical app: consumers cannot see inside, and a regression ships
        // everywhere at once. Do NOT chase 100% — the last 15% is contrived error branches,
        // and that effort buys more as a real screen-reader pass.
        lines: 80,
        functions: 80,
        branches: 75,
        statements: 80,
      },
    },
    // The registry build reads this to publish real test counts per component.
    outputFile: { json: './.vitest-report.json' },
  },
});
