import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import jsxA11y from 'eslint-plugin-jsx-a11y';
import ds from './tools/eslint-plugin-design-system.mjs';

export default tseslint.config(
  { ignores: ['dist', 'build', 'coverage', '**/tokens/dist/**', '.design-system'] },

  js.configs.recommended,
  ...tseslint.configs.recommended,

  {
    files: ['**/*.{ts,tsx}'],
    plugins: { react, 'react-hooks': reactHooks, 'jsx-a11y': jsxA11y, ds },
    languageOptions: { parserOptions: { ecmaFeatures: { jsx: true } } },
    settings: {
      react: { version: 'detect' },
      designSystem: {
        tokens: './tokens/dist/tokens.json',
        prefix: 'ds',
        packageName: '@acme/ui',
      },
      // Without this mapping jsx-a11y cannot see through <Button> to the <button>
      // underneath, and every rule that depends on element semantics silently no-ops.
      'jsx-a11y': {
        components: {
          Button: 'button',
          IconButton: 'button',
          TextField: 'input',
          Textarea: 'textarea',
          Select: 'select',
          Link: 'a',
          Image: 'img',
        },
      },
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      ...jsxA11y.flatConfigs.strict.rules,

      'jsx-a11y/no-autofocus': 'error', // autofocus strands screen-reader users mid-page
      'react/jsx-no-target-blank': 'error',

      '@typescript-eslint/consistent-type-imports': ['error', { prefer: 'type-imports' }],
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },

  /**
   * ROLL-OUT ORDER (see the design-system-linting skill).
   *
   * Turning all of this on at `error` across an existing codebase produces thousands of
   * violations and a team that disables the rule. Ship as `warn`, measure, autofix what is
   * mechanical, then `error` on changed files in CI, then ratchet directory by directory.
   *
   * These two are `error` from day one because they are cheap to keep clean and expensive
   * to fix later: a primitive-token reference is invisible until someone adds a theme, and
   * a deep import breaks on the next refactor.
   */
  {
    files: ['src/**/*.{ts,tsx}'],
    rules: {
      'ds/no-raw-color': 'warn',
      'ds/no-hardcoded-dimension': ['warn', { allow: [0, 1] }],
      'ds/no-primitive-token': 'error',
      'ds/no-deep-import': 'error',
    },
  },

  // Migrated areas ratchet up to strict. Add directories here as they get cleaned.
  {
    files: ['src/design-system/**/*.{ts,tsx}'],
    rules: {
      'ds/no-raw-color': 'error',
      'ds/no-hardcoded-dimension': ['error', { allow: [0, 1] }],
    },
  },

  // The token layer DEFINES the primitives, so it is allowed to use them.
  {
    files: ['tokens/**', 'src/design-system/tokens/**'],
    rules: { 'ds/no-primitive-token': 'off', 'ds/no-raw-color': 'off' },
  },

  // Tests assert on raw values on purpose.
  {
    files: ['**/*.test.{ts,tsx}', '**/*.stories.tsx'],
    rules: { 'ds/no-raw-color': 'off', 'ds/no-hardcoded-dimension': 'off' },
  },
);
