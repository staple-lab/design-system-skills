/**
 * Stylelint enforces the same rules as the ESLint plugin, on the CSS side.
 *
 * Needed whenever styles live in .css / .module.css files — the ESLint plugin only sees
 * strings inside TS/TSX, so a design system on CSS Modules is completely unguarded
 * without this.
 */
export default {
  extends: ['stylelint-config-standard'],
  ignoreFiles: ['**/tokens/dist/**', '**/dist/**', '**/node_modules/**'],
  rules: {
    // Colour must come from a token. `var(--ds-color-*)` passes; a hex does not.
    'color-no-hex': true,
    'color-named': 'never',

    // Off-scale dimensions, durations and z-indexes.
    'declaration-property-value-disallowed-list': {
      '/^(padding|margin|gap|inset|top|right|bottom|left)/': [/^-?\d+px$/],
      '/^(transition-duration|animation-duration)$/': [/^\d+m?s$/],
      'z-index': [/^\d+$/],
      'font-size': [/^\d+(px|rem)$/],
      'border-radius': [/^\d+px$/],
    },

    // If you need !important, the specificity design is wrong — and each one makes the
    // next override harder. Worth the argument it will start.
    'declaration-no-important': true,

    'custom-property-pattern': '^ds-[a-z0-9-]+$',
    'selector-class-pattern': null, // CSS Modules use camelCase locally

    // Physical properties break RTL. Logical ones cost nothing to type.
    'property-disallowed-list': ['margin-left', 'margin-right', 'padding-left', 'padding-right'],

    'media-feature-range-notation': 'context',
    'no-descending-specificity': null, // noisy with data-attribute state selectors
  },
};
