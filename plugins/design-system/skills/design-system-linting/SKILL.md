---
name: design-system-linting
description: Use when setting up or extending lint rules that enforce a design system - token enforcement (no raw hex or magic numbers), import boundaries, jsx-a11y, stylelint, and writing custom ESLint rules. Triggers on "lint rules", "enforce tokens", "no hardcoded colors", "eslint plugin", "stylelint".
---

# Design system linting

A design system that relies on people remembering it decays. Lint rules are how the system defends itself between code reviews — and they work at the only moment that matters, while the developer is still holding the context.

Rule of thumb: **if you would say it in code review more than twice, make it a lint rule.** If you cannot express it as a rule, it probably belongs in the API's type signature instead.

## The four layers

| Layer | Enforces | Tool |
|---|---|---|
| Token enforcement | No raw hex, no magic spacing, no ad-hoc durations | custom ESLint plugin + Stylelint |
| Import boundaries | Public entry points only; no deep imports; no primitives in product code | `eslint-plugin-import` / custom |
| Accessibility | Static a11y defects | `eslint-plugin-jsx-a11y` |
| Correctness | Hook rules, dead exports, bundle hygiene | `eslint-plugin-react-hooks`, `knip` |

## Token enforcement

The rules that pay for themselves. Copy `${CLAUDE_PLUGIN_ROOT}/templates/lint/eslint-plugin-design-system.mjs` — it ships four rules, dependency-free:

- **`no-raw-color`** — flags hex, `rgb()`, `hsl()`, `oklch()` literals in JSX `style`, template literals, CSS-in-JS objects and `className` arbitrary values. Autofixes to the nearest token when one matches exactly, and names the closest candidates when it does not.
- **`no-hardcoded-dimension`** — flags `px` values that are not on the spacing/radius scale. Ignores `0`, `1px` (hairlines are legitimate), and values inside `calc()` where the intent is usually relative.
- **`no-primitive-token`** — flags components referencing `--ds-color-blue-600` instead of a semantic token. **This is the highest-value rule in the set** — a primitive reference is invisible until the day someone tries to add a theme, at which point it is a hundred-file migration.
- **`no-deep-import`** — flags `@acme/ui/dist/components/Button/Button` instead of `@acme/ui` or `@acme/ui/button`.

```js
// eslint.config.mjs
import ds from './tools/eslint-plugin-design-system.mjs';

export default [
  {
    files: ['src/**/*.{ts,tsx}'],
    plugins: { ds },
    rules: {
      'ds/no-raw-color': 'error',
      'ds/no-hardcoded-dimension': ['error', { allow: [0, 1] }],
      'ds/no-primitive-token': 'error',
      'ds/no-deep-import': 'error',
    },
    settings: { designSystem: { tokens: './tokens/dist/tokens.json' } },
  },
  {
    // The design system itself defines the primitives — it is allowed to use them.
    files: ['src/design-system/tokens/**', 'tokens/**'],
    rules: { 'ds/no-primitive-token': 'off', 'ds/no-raw-color': 'off' },
  },
];
```

The rules read the generated `tokens/dist/tokens.json`, so they stay in sync with the tokens automatically. That is the whole point of one registry: the lint rules and the docs cannot disagree.

## Rolling it out without a revolt

Turning `error` on across an existing codebase produces 4,000 violations and a team that disables the rule. Sequence it:

1. **Ship as `warn`.** Measure. `npx eslint . -f json | jq` gives you the count by rule and by directory — the honest baseline.
2. **Autofix what is mechanical.** Exact colour matches usually convert cleanly; run it as one reviewable commit that touches nothing else.
3. **`error` on new and changed code only** — lint the diff in CI (`eslint $(git diff --name-only origin/main)`). New code is clean from day one, and the backlog is not a blocker.
4. **Ratchet.** Add directories to the `error` set as they get migrated. A count that only goes down is a target the team can hit.
5. Never `--no-verify` your way past it. One exception becomes the norm within a month.

## Accessibility rules

`eslint-plugin-jsx-a11y`, `strict` config, plus the mapping for your components — without it the plugin cannot see through `<Button>` to the `<button>` underneath:

```js
settings: {
  'jsx-a11y': {
    components: { Button: 'button', TextField: 'input', Link: 'a', Image: 'img' },
  },
},
```

The rules worth being strict about: `alt-text`, `anchor-is-valid`, `click-events-have-key-events`, `no-noninteractive-element-interactions`, `label-has-associated-control`, `no-autofocus` (autofocus strands screen-reader users mid-page).

These catch static defects only — roughly the same 30–40% ceiling as axe. They do not replace the behavioural tests.

## Stylelint

For CSS Modules, vanilla CSS or `.css.ts`:

```js
export default {
  extends: ['stylelint-config-standard'],
  rules: {
    'color-no-hex': true,
    'declaration-property-value-disallowed-list': {
      '/^(padding|margin|gap|inset|top|right|bottom|left)/': [/^\d+px$/],
      'transition-duration': [/^\d+m?s$/],
      'z-index': [/^\d+$/],
    },
    'declaration-no-important': true,
    'custom-property-pattern': '^ds-[a-z0-9-]+$',
  },
};
```

`declaration-no-important` is worth the argument it will start. `!important` inside a design system means the specificity design is wrong, and each one makes the next override harder.

## Import boundaries

```js
'no-restricted-imports': ['error', {
  patterns: [
    { group: ['@acme/ui/dist/*', '@acme/ui/src/*'], message: 'Import from @acme/ui or @acme/ui/<component>. Deep imports break on any internal refactor.' },
    { group: ['@radix-ui/*', '@base-ui/*'], message: 'Product code uses @acme/ui, not the primitives directly. If a component is missing, ask for it — that request is the roadmap.' },
  ],
}],
```

That second rule is as much a product signal as a constraint: every violation is a real gap in the system, and the list of them is the most honest backlog you will get.

## Beyond lint

- **`knip`** — dead exports and unused dependencies. Design systems accumulate both fast.
- **`publint` + `@arethetypeswrong/cli`** — packaging correctness in CI. Broken `exports` maps are the most common way a design system release breaks consumers, and neither typecheck nor tests catch it.
- **size-limit** — a budget per entry point, failing the build on regression. A component library that silently grows 40kb loses the argument for existing.
- **Danger / CI comment** — post the token-violation delta on each PR. Visible numbers move behaviour more than a rule nobody reads.

## Writing a custom rule

Keep them boring and precise. A rule with false positives gets disabled, and a disabled rule enforces nothing:

```js
export const noRawColor = {
  meta: {
    type: 'problem',
    docs: { description: 'Use semantic design tokens instead of raw colour values' },
    fixable: 'code',
    schema: [],
    messages: {
      raw: 'Raw colour "{{value}}". Use a semantic token{{suggestion}}.',
    },
  },
  create(context) {
    const tokens = loadTokens(context);   // from settings.designSystem.tokens
    return {
      Literal(node) {
        if (typeof node.value !== 'string' || !COLOR_RE.test(node.value)) return;
        const match = tokens.byHex.get(normalise(node.value));
        context.report({
          node,
          messageId: 'raw',
          data: { value: node.value, suggestion: match ? ` — try ${match}` : '' },
          fix: match ? (fixer) => fixer.replaceText(node, `'var(${cssVar(match)})'`) : undefined,
        });
      },
    };
  },
};
```

Always name the replacement in the message. "Use a design token" tells the developer nothing; "try `color.bg.accent`" gets fixed in five seconds.
