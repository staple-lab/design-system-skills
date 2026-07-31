# Stack constraints — the resolver

The interview asks four stack questions as if they were independent. They are not. Several
component-layer choices *contain* an answer to the primitives question, *require* an answer
to the CSS-system question, or make one of the questions moot. Apply this table **after the
interview and before writing the brief** — it is what turns four answers into one coherent
stack.

Facts below were verified against npm and vendor docs in **July 2026** (package versions in
the notes). Re-verify with `npm view <pkg> version peerDependencies` before installing;
peer-dependency couplings marked *(npm-enforced)* will fail at install time if violated,
which is the useful kind of constraint — you cannot silently ship the wrong combination.

## How to apply

1. **Resolve `componentLayer` first.** It is the most constraining choice — every REQUIRES
   and IMPLIES below flows *from* it into the other three questions.
2. **REQUIRES** = hard dependency. If the user's other answers contradict it, the
   component-layer choice wins and you override the contradicted answer (or, if the user
   clearly cares more about the contradicted answer — they chose vanilla-extract *for a
   reason* — offer to drop the component layer instead). Never proceed with both.
3. **IMPLIES** = another question is now answered or moot. Record the implied value in the
   config; do not leave the field describing a library that will never be installed.
4. **CONFLICTS** = combinations that cannot work. Two entries apply globally:
   **one primitive layer per system** (two focus-management philosophies fight in the same
   portal) and **one pre-styled component library per system** (two theming engines, two
   visual identities, no winner).
5. Whatever you resolve, **say it to the user in one sentence each** before writing the
   brief, and set `stack.resolved: true` with a `rationale` entry per overridden decision.

Every option name below exists in `stack-menu.md`; config values in parentheses are the
enums in `design-system.schema.json`.

## Component layer

| Option (config value) | REQUIRES | IMPLIES | CONFLICTS |
|---|---|---|---|
| **shadcn-style** (`own`) | Via the shadcn CLI: `cssSystem: tailwind` — generated components are Tailwind class strings, restyling them into another system is a rewrite. Hand-written `own` components: no constraint. | The CLI's `--base radix \| base \| aria` **must equal** the `primitives` answer — it selects which primitive layer the generated code imports. Not a new decision; a coupling to enforce. | `--base` disagreeing with `primitives`. |
| **Pure primitives** (`none`) | — | — | — |
| **MUI** (`mui`) | React ≥17 *(npm-enforced, `@mui/material` 9.2.0)*. | Ships its own behaviour layer → `primitives: none` (an independently chosen primitive lib is dead config next to it). Brings its own styling engine — Emotion (`@emotion/react` + `@emotion/styled`, optional peers) or `@mui/material-pigment-css` — so `cssSystem` is moot *for MUI components*; the CSS system you record styles product code around them, not them. | A second pre-styled library. Emotion default = client runtime, which fights RSC (see `css-systems`). |
| **Mantine** (`mantine`) | React ^19.2 *(npm-enforced, `@mantine/core` 9.4.2 — unusually strict)*. | Ships its own behaviour layer → `primitives: none`. Ships its own compiled CSS (CSS-modules-built, themed via `--mantine-*` vars) → `cssSystem` moot for its components. | A second pre-styled library. |
| **Chakra UI** (`chakra`) | `@emotion/react` *(npm-enforced, `@chakra-ui/react` 3.36.1 — required, not optional)*. | Built on Ark internally → `primitives: ark` (resolved via itself; do not also install `@ark-ui/react` conventions independently). Brings its own Panda-style engine on an Emotion runtime → `cssSystem` moot for its components. | A second pre-styled library. Emotion runtime = client boundary cost under RSC. |
| **HeroUI** (`heroui`) | `cssSystem: tailwind` — Tailwind **v4**, `tailwindcss>=4.0.0` *(npm-enforced, `@heroui/react` and `@heroui/styles` 3.2.2)*. React ≥19 *(npm-enforced)*. | Built on React Aria Components → `primitives: react-aria` (resolved via itself — RAC arrives inside HeroUI; do not install a second copy of the decision). One pick answers **three** questions. | Any `cssSystem` other than tailwind — css-modules, stylex, vanilla-extract, panda, emotion, styled-components, unocss (install fails on the peer dep). A second primitive layer (`base-ui`, `radix`) in the same system. A second pre-styled library. |
| **Ant Design** (`antd`) | React ≥18 *(npm-enforced, `antd` 6.5.2)*. | Ships its own behaviour layer → `primitives: none`. v6 styling defaults to CSS-variable mode (`--ant-*` via `@ant-design/cssinjs`) → `cssSystem` moot for its components. | A second pre-styled library. |
| **Park UI** (`park`) | `cssSystem: panda` in practice — the maintained integration is `@park-ui/panda-preset`; a `@park-ui/tailwind-plugin` exists but was last published ~2 years ago (0.20.1). Treat Panda as the real path. | Built on Ark → `primitives: ark`. | A second pre-styled library. |
| **Radix Themes** (`radix-themes`) | — | Built on Radix Primitives → `primitives: radix`. Ships a precompiled stylesheet + its own CSS variables → `cssSystem` moot for its components. | A second pre-styled library. |

`motion` is never constrained by the component layer: every option above animates with CSS
and tolerates Motion/GSAP alongside. The only note worth making is that a pre-styled layer
already ships its own component animations (HeroUI: CSS-only by design), so a heavy motion
choice buys less.

## Primitive layer

Primitive libraries are all styling-agnostic — none REQUIRES a CSS system. Their
constraints run the other way: certain component layers make the choice for you.

| Option (config value) | REQUIRES | IMPLIES | CONFLICTS |
|---|---|---|---|
| **Base UI** (`base-ui`) | — | — | Any second primitive layer. Any component layer that embeds or replaces the behaviour layer (`heroui`→RAC, `chakra`/`park`→Ark, `radix-themes`→Radix, `mui`/`mantine`/`antd`→their own). |
| **Radix Primitives** (`radix`) | — | Compatible with `radix-themes` (its base) and shadcn `--base radix`. | Same as above, minus `radix-themes`. |
| **React Aria Components** (`react-aria`) | — | Compatible with `heroui` (its base) and shadcn `--base aria`. | Same as above, minus `heroui`. |
| **Ark UI** (`ark`) | — | Compatible with `chakra` and `park` (their base). | Same as above, minus `chakra`/`park`. |
| **Headless UI** (`headless-ui`) | — | — | Any second primitive layer; every pre-styled layer embeds something else. Too thin for a full system regardless (see stack-menu). |
| **Build in-house** (`none`) | A dedicated a11y engineer (see stack-menu — say it once, then respect it). | — | — (also the correct *recorded* value when a pre-styled layer makes the question moot). |

## How the token layer links upward into a pre-styled layer

When the component layer is pre-styled, the token pipeline does not stop mattering — it
changes direction. Instead of components consuming `--ds-*` variables directly, the DTCG
source feeds the *vendor's* theming surface. The linkage is CSS-side for some layers and
JS-side for others, and the difference decides what `tokens/build.mjs` output you wire in.

### HeroUI — CSS-side, fully wired *(verified against heroui.com/docs/handbook/theming, v3.2.2, July 2026)*

The chain: **DTCG tokens → `tokens/build.mjs` → `tokens/dist/tokens.css` (`--ds-*` custom
properties) → a bridge file assigning HeroUI's semantic variables → HeroUI's own
`@theme inline` bridge → Tailwind utilities.**

Mechanism facts, from the docs:

- `@heroui/styles` is imported after `tailwindcss` in the app CSS and organises itself in
  CSS layers. Its semantic variables follow one naming rule: a bare name is a background
  (`--accent`, `--background`, `--surface`), the `-foreground` suffix is text on it
  (`--accent-foreground`).
- `themes/shared/theme.css` inside the package maps those semantic variables to Tailwind
  tokens via `@theme inline` (`--color-background: var(--background)`, plus `--radius-*`,
  `--ease-*`) — so overriding the semantic variable re-themes every `bg-accent` /
  `text-foreground` utility without touching Tailwind config.
- Hover, soft and border variants are **calculated variables** derived from the semantic
  ones with `color-mix()` — override `--accent` once and the pressed/soft states follow.
  Form controls hang off `--field-*` the same way.
- Themes switch by class + attribute on `<html>` (`class="dark" data-theme="dark"`); custom
  themes are `[data-theme="name"]` blocks imported into `layer(theme)`.

So the bridge is small, and it mirrors the docs' own override pattern:

```css
/* app/globals.css */
@import 'tailwindcss';
@import '@heroui/styles';
@import './tokens/dist/tokens.css';

:root, [data-theme='light'] {
  --background: var(--ds-color-bg-default);
  --foreground: var(--ds-color-fg-default);
  --accent: var(--ds-color-bg-accent);
  --accent-foreground: var(--ds-color-fg-on-accent);
}
.dark, [data-theme='dark'] {
  --background: var(--ds-color-bg-default);
  --foreground: var(--ds-color-fg-default);
  --accent: var(--ds-color-bg-accent);
  --accent-foreground: var(--ds-color-fg-on-accent);
}
```

The light and dark blocks assign the *same* `--ds-*` names because the token build already
flips their values under `[data-theme]` — use the **same `data-theme` attribute values**
for both layers so one toggle switches both. The dark block is not redundant: HeroUI's own
dark theme sets `--accent` etc. inside its theme layer, and re-asserting the assignment in
both blocks is the pattern its docs use for custom colors.

One trade-off to state to the user: this wires *colors, radii and easing* into HeroUI, but
HeroUI's spacing/typography base variables and its 75+ components' internal layout remain
the vendor's. You are theming its system, not replacing it — which is exactly the deal a
pre-styled layer offers.

### MUI — JS-side

The linkage is the theme object, not CSS: `createTheme({ cssVariables: true, palette:
{ ... } })`, after which MUI emits its own `--mui-*` variables (e.g.
`--mui-palette-primary-main`) *(verified at mui.com, css-theme-variables docs, July 2026)*.
Feed **literal color values** from a JSON/TS artifact of the token build, not
`var(--ds-*)` strings — `createTheme` computes derived colors (hover tints, `contrastText`)
from the palette values, and it cannot compute from an unresolved `var()`.

### Mantine — JS-side with a CSS-var surface

Map token values into `createTheme(...)` passed to `MantineProvider`; Mantine emits
`--mantine-*` variables, and `cssVariablesResolver` exists for custom variable mapping
*(verified at mantine.dev, July 2026)*. Same rule as MUI: feed values, not `var()` strings,
where Mantine derives shades.

### Chakra v3 — JS-side

Token wiring goes through its theme config (Emotion runtime underneath — the peer dep is
required). The exact `createSystem`/config shape was **not re-verified** for this document
— check chakra-ui.com/docs theming before wiring; do not write it from memory.

### Ant Design v6 — JS-side with CSS-var output

`ConfigProvider theme={{ token: { ... } }}` with values from the token build; v6 defaults
to CSS-variable mode with the `--ant-*` prefix *(verified via ant.design v6 release notes,
July 2026)*.

### Park UI — build-config-side

The token build already emits a Panda preset (`tokens/dist/preset`, see `css-systems`);
compose it with `@park-ui/panda-preset` in the `presets` array of `panda.config.ts`.

### Radix Themes — CSS-side, partially

Ships a precompiled stylesheet themed by `<Theme>` props and its own color-scale CSS
variables. Custom brand palettes mean overriding its generated scales — check the current
custom-color guidance at radix-ui.com/themes before promising a full token wire-up; it was
**not re-verified** for this document.
