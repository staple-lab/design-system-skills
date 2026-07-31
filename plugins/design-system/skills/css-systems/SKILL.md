---
name: css-systems
description: Use when wiring design tokens into a styling system or writing component styles - Tailwind v4, CSS Modules, StyleX, vanilla-extract, Panda CSS, Emotion - or when feeding tokens into a pre-styled component layer's theming (HeroUI, MUI, Mantine, Chakra, antd). Covers how tokens reach components in each system, variant patterns, theming, RSC compatibility, and how a design system ships its CSS to consumers.
---

# CSS systems

The CSS system's job is narrow: **make tokens reachable from components, idiomatically.** It does not define values — the DTCG token layer does, and `tokens/build.mjs` emits whatever artifact this system needs. Keeping that boundary is what lets you change CSS systems in three years without redesigning anything.

Read the chosen system from `design-system.config.json → stack.cssSystem`.

## The universal substrate

Whatever the system, the generated `tokens.css` is always emitted and always loaded first. Every other artifact points back at those custom properties rather than inlining values, which is what makes `[data-theme]` switching work at runtime with no rebuild and no flash.

```css
@import './tokens/dist/tokens.css';   /* always, in every system */
```

---

## Tailwind v4

CSS-first. `@theme inline` maps Tailwind's namespaces onto the token vars, so utilities re-theme for free:

```css
/* tokens/dist/theme.css — generated */
@import 'tailwindcss';
@import './tokens.css';

@theme inline {
  --color-background: var(--ds-color-bg-default);
  --color-accent: var(--ds-color-bg-accent);
  --color-accent-foreground: var(--ds-color-fg-on-accent);
  --spacing-4: var(--ds-space-4);
  --radius-md: var(--ds-radius-md);
  --ease-emphasized: var(--ds-easing-emphasized);
}
```

`inline` is the important keyword: without it Tailwind resolves the variable at build time and freezes the light-theme value into the utility, and dark mode silently stops working. With it, the utility keeps pointing at the live custom property.

Variants belong in **CVA** (`class-variance-authority`) or `tailwind-variants`, not in ad-hoc template strings:

```tsx
const button = cva('inline-flex items-center justify-center rounded-md font-medium transition-colors ' +
                   'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ' +
                   'disabled:pointer-events-none disabled:opacity-50', {
  variants: {
    variant: {
      primary:   'bg-accent text-accent-foreground hover:bg-accent-hover active:bg-accent-active',
      secondary: 'bg-subtle text-foreground hover:bg-subtle-hover',
      ghost:     'bg-transparent text-foreground hover:bg-subtle',
      danger:    'bg-danger text-danger-foreground hover:bg-danger-hover',
    },
    size: { sm: 'h-8 px-3 text-sm', md: 'h-10 px-4 text-sm', lg: 'h-12 px-5 text-base' },
  },
  defaultVariants: { variant: 'primary', size: 'md' },
});
```

Merge consumer classes with `tailwind-merge` (`cn()`), or `className="p-8"` loses to the component's own `p-4` by source order rather than by intent — a bug that looks like the escape hatch is broken.

**Shipping to consumers:** publish the compiled CSS *and* a `@source` directive pointing at your package, so consumers' Tailwind scans your components for classes. Document which; getting this wrong produces a component library that renders unstyled in someone else's app.

---

## CSS Modules

The most durable option. Tokens are already custom properties, so there is nothing to wire:

```css
/* Button.module.css */
.button {
  display: inline-flex; align-items: center; justify-content: center;
  height: var(--ds-control-height-md);
  padding-inline: var(--ds-control-padding-x-md);
  border-radius: var(--ds-control-radius);
  font: var(--ds-type-label-font-weight) var(--ds-type-label-font-size) / var(--ds-type-label-line-height) var(--ds-type-label-font-family);
  transition: background-color var(--ds-duration-fast) var(--ds-easing-standard);
}
.button:focus-visible {
  outline: var(--ds-focus-ring-width) solid var(--ds-color-ring);
  outline-offset: var(--ds-focus-ring-offset);
}
.primary { background: var(--ds-color-bg-accent); color: var(--ds-color-fg-on-accent); }
.primary:hover:not(:disabled) { background: var(--ds-color-bg-accent-hover); }
```

Compose variants with a small local helper rather than a dependency:

```tsx
import s from './Button.module.css';
const cx = (...c: (string | false | undefined)[]) => c.filter(Boolean).join(' ');
<button className={cx(s.button, s[variant], s[size], className)} />
```

**Shipping:** one stylesheet, consumers `import '@acme/ui/styles.css'`. The simplest consumer story of any system, which is a real argument for it in a library.

---

## StyleX

Build-time atomic CSS with typed vars and — the genuine differentiator — **deterministic merge order**. The last style applied wins, predictably, instead of depending on CSS source order and specificity:

```ts
import * as stylex from '@stylexjs/stylex';
import { tokens } from '../tokens/dist/tokens.stylex';

const styles = stylex.create({
  base: {
    display: 'inline-flex',
    height: tokens.controlHeightMd,
    borderRadius: tokens.controlRadius,
    transitionDuration: tokens.durationFast,
  },
  primary: {
    backgroundColor: { default: tokens.colorBgAccent, ':hover': tokens.colorBgAccentHover },
    color: tokens.colorFgOnAccent,
  },
});

<button {...stylex.props(styles.base, variant === 'primary' && styles.primary)} />
```

The trade-off: consumers cannot restyle with `className` from outside, by design. That is a feature in an app and a problem in a distributed library — expose a `style` prop with token-typed values instead, and be explicit about it in the docs.

---

## vanilla-extract

Typed styles in `.css.ts`, and the strongest correctness story: **a theme that forgets a token is a type error**.

```ts
// Button.css.ts
import { style, styleVariants } from '@vanilla-extract/css';
import { vars } from '../tokens/dist/contract.css';

export const base = style({
  display: 'inline-flex',
  height: vars.control.height.md,
  borderRadius: vars.control.radius,
  ':focus-visible': { outline: `2px solid ${vars.color.ring}`, outlineOffset: '2px' },
});

export const variant = styleVariants({
  primary: { background: vars.color.bg.accent, color: vars.color.fg.onAccent },
  ghost:   { background: 'transparent', color: vars.color.fg.default },
});
```

`createGlobalThemeContract` (what the token build emits) points the contract at the existing custom properties, so you keep runtime theme switching *and* compile-time safety. `recipes` covers variants with typed props.

---

## Panda CSS

Token-first config with excellent variant ergonomics via recipes:

```ts
import preset from './tokens/dist/preset';
export default defineConfig({ presets: ['@pandacss/dev/presets', preset], /* ... */ });
```

```ts
export const button = cva({
  base: { display: 'inline-flex', h: 'control.height.md', rounded: 'control.radius' },
  variants: { variant: { primary: { bg: 'color.bg.accent', color: 'color.fg.on-accent' } } },
});
```

Slot recipes are the cleanest multi-part-component styling of any system here. Cost: a real build step, and a smaller community when something goes wrong.

---

## Emotion / styled-components

Runtime CSS-in-JS. **Do not start here in 2026** — both need a client runtime, which fights React Server Components and streaming SSR, and styled-components is in maintenance. Support them only for migration. If you are stuck with one, drive it from the same custom properties (`background: var(--ds-color-bg-accent)`) so the migration path stays open.

---

## Pre-styled component layers

When `design-system.config.json → stack.componentLayer` names a pre-styled library
(`heroui`, `mui`, `mantine`, `chakra`, `antd`, `radix-themes`, `park`), this skill's job
changes: you are not styling components — the vendor did that — you are **feeding the
vendor's theming surface from the tokens**. The full per-library wiring (and which of it is
verified vs. needs checking) lives in
`${CLAUDE_PLUGIN_ROOT}/skills/design-system-architect/references/stack-constraints.md`;
the shape of the work:

- **HeroUI** (Tailwind v4 required — npm-enforced peer dep): CSS-side. Assign HeroUI's
  semantic variables from the generated `--ds-*` custom properties in `:root,
  [data-theme='light']` and `.dark, [data-theme='dark']` blocks — `--accent:
  var(--ds-color-bg-accent)`, `--accent-foreground: var(--ds-color-fg-on-accent)`,
  `--background`, `--foreground`, and so on. HeroUI's own `@theme inline` bridge
  (`themes/shared/theme.css`) then carries those into Tailwind utilities, and its
  `color-mix()`-calculated hover/soft/field variants derive automatically — one assignment
  re-themes the interactive states too. Use the same `data-theme` values as the token
  build so one toggle flips both layers.
- **MUI / Mantine / Chakra / antd**: JS-side. Token values flow into `createTheme` /
  `MantineProvider` / the Chakra system config / `ConfigProvider theme.token` — as
  **literal values from a token-build artifact, not `var(--ds-*)` strings**, because these
  engines compute derived colors (hover tints, contrast text) from the values and cannot
  compute from an unresolved `var()`.

Either way the token layer stays the source of truth; what changes is the artifact the
build emits and where it is handed over. The `tokens.css` substrate is still loaded first —
product code outside the vendor's components consumes `--ds-*` directly, as everywhere
else in this skill.

1. **Semantic tokens only.** No raw hex, no magic px. New value → new token first. This is the lint layer's main job.
2. **State from `data-*`, not from React.** `[data-state='open']`, `[data-disabled]`. The DOM is already the source of truth.
3. **`:focus-visible`, never `:focus`.** `:focus` fires on mouse click, which is what gets focus styles deleted, which is what strands keyboard users.
4. **Logical properties.** `padding-inline`, `margin-block`, `inset-inline-start`. Free RTL, and it costs nothing to type.
5. **One escape hatch, deliberately chosen.** `className` passthrough, a `style` prop, or exposed component-level CSS vars. Without one, people fork the component and you lose them permanently.
6. **No `!important` inside the system.** If you need it, the specificity design is wrong.
7. **Container queries over media queries** for component-level responsiveness — a component should respond to *its* space, not the viewport's. `@container (min-width: 24rem)` is what makes a card work in both a sidebar and a full-width grid without a prop.
