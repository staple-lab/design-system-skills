---
name: design-tokens
description: Use when creating, editing, theming or building design tokens - colour ramps, type scale, spacing, radius, elevation, motion values, light/dark and multi-brand themes, DTCG JSON authoring, and generating CSS variables, TypeScript types and CSS-system artifacts. Triggers on "design tokens", "colour palette", "type scale", "dark mode", "theming", "rebrand".
---

# Design tokens

A token is a **named decision**. Its value matters less than the fact that everyone refers to it by the same name — that is what makes a rebrand a one-file change instead of a three-month grep.

## Three tiers, and the rule that makes them work

```
PRIMITIVE          color.blue.600 = #2563EB      "what colours exist"
   ↓  referenced only by ↓
SEMANTIC           color.bg.accent = {color.blue.600}   "what colours mean"
   ↓  consumed by ↓
COMPONENT          button.primary.bg = {color.bg.accent}   "what this component uses"
```

**The rule: components may only consume semantic and component tokens. Never primitives.** A component that references `color.blue.600` cannot be re-themed — you have hardcoded a colour with extra steps. This single rule is what the lint layer enforces, and it is the difference between a token system and a variable dump.

Component tokens are optional and easy to overdo. Add one only when a component needs a knob nothing else needs (`button.primary.bg` earns its place if buttons can be re-skinned independently; `card.padding` usually does not — that is `space.4`). Every unnecessary component token is an extra thing to maintain in every theme.

## Authoring format: DTCG

Author in the **Design Tokens Format Module** (W3C DTCG, stable version `2025.10`) — `$value`, `$type`, `$description`, and `{dot.path}` references. It is the format Figma, Tokens Studio, Style Dictionary, Supernova, zeroheight and Penpot all speak, which means the tokens can round-trip to design tools instead of being a dev-only artifact.

```jsonc
{
  "color": {
    "$type": "color",
    "blue": {
      "600": { "$value": "#2563eb", "$description": "Brand primary. WCAG AA on white at 14px+." }
    },
    "bg": {
      "accent": { "$value": "{color.blue.600}", "$description": "Filled accent surfaces: primary buttons, active nav." }
    }
  },
  "space": {
    "$type": "dimension",
    "4": { "$value": { "value": 16, "unit": "px" } }
  }
}
```

Notes that trip people up:
- `$type` inherits down the tree — set it once on the group.
- `2025.10` `dimension` values are objects (`{value, unit}`), not strings. Older tooling emits `"16px"`; the build script in this plugin accepts both and normalises.
- `$description` is not decoration. It is what appears in the token explorer and what an AI agent reads to decide whether this is the right token. Write it for the person choosing between two similar tokens.

Files, in `tokens/`:

| File | Contains |
|---|---|
| `primitive.tokens.json` | Raw ramps and scales. No references. Theme-independent. |
| `semantic.tokens.json` | Meaning, per theme (`light`, `dark`, and any brand). All references. |
| `component.tokens.json` | Per-component knobs. All references. |

## Naming

`category.role.variant.state` — read left to right, general to specific.

```
color.bg.accent           color.bg.accent.hover
color.fg.default          color.fg.muted        color.fg.on-accent
color.border.default      color.border.focus
space.4                   radius.md             shadow.raised
duration.fast             easing.emphasized     z.popover
```

- Name by **role, not appearance**. `color.fg.muted`, never `color.gray.light` — in dark mode the muted foreground is lighter than the default, and a name containing "light" becomes a lie.
- `fg` / `bg` / `border` beats `text` / `background` / `stroke` for terseness, but any consistent choice works. Consistency is the whole point.
- `on-accent` for "foreground that sits on the accent background". This pairing convention is what makes the contrast gate automatable.
- No numbers in semantic names. `color.bg.surface.raised` not `color.bg.surface.2` — a number tells you nothing about when to use it.

## The scales

Read `references/scales.md` for the full construction method. In brief:

- **Colour** — build ramps in **OKLCH**, not HSL. HSL's lightness is not perceptual: `hsl(60 100% 50%)` (yellow) and `hsl(240 100% 50%)` (blue) claim the same lightness and differ by a factor of ~8 in perceived brightness, so an HSL ramp gives you steps that look evenly spaced in some hues and badly bunched in others. OKLCH lightness matches perception, so one ramp recipe works across every hue. 12 steps per ramp (a 50–950 scale) covers surfaces, borders, fills and text.
- **Spacing** — a 4px base grid, geometric-ish: `0, 1, 2, 4, 6, 8, 12, 16, 24, 32, 48, 64, 96`. Not every multiple of 4 — a scale with too many rungs is not a scale, it is permission.
- **Type** — a modular scale (1.200 minor third for dense UI, 1.250 for standard product, 1.333+ for editorial), with `clamp()` for fluid sizes at display end. Line height is inverse to size: tight for headings (1.1–1.25), open for body (1.5–1.6).
- **Radius / elevation / motion / z-index** — small, closed sets. Elevation especially: 4 levels maximum, each a *pair* of shadows (a tight contact shadow + a diffuse ambient one) or it looks flat and fake.

## Theming

**A theme reassigns semantics. It never redefines primitives.** `blue.600` means the same hex in every theme; `color.bg.accent` is what points somewhere different.

```jsonc
// semantic.tokens.json
{
  "light": { "color": { "bg": { "default": { "$value": "{color.neutral.50}"  } } } },
  "dark":  { "color": { "bg": { "default": { "$value": "{color.neutral.950}" } } } }
}
```

Emitted as CSS custom properties under a selector per theme, which gives you free runtime switching with no rebuild and no flash:

```css
:root, [data-theme="light"] { --color-bg-default: #fafafa; }
[data-theme="dark"]          { --color-bg-default: #0a0a0a; }
@media (prefers-color-scheme: dark) { :root:not([data-theme]) { --color-bg-default: #0a0a0a; } }
```

That last block matters: it respects the OS preference *until* the user explicitly picks, and `[data-theme]` always wins. Set the attribute on `<html>` from an inline script before first paint or the page flashes.

**Dark mode is not an inversion.** Three things change beyond flipping lightness:
1. Elevation reverses — in light mode raised surfaces cast shadows; in dark mode they get *lighter*, because shadow on near-black is invisible.
2. Saturated colours vibrate on dark backgrounds. Desaturate accents by ~10–20% chroma and lift their lightness for dark.
3. Pure white text on pure black is harsher than paper ever is. Use `neutral.50` on `neutral.950`, not `#fff` on `#000`.

**Multi-brand** works the same way with another dimension: one semantic layer, several primitive palettes, `[data-brand="acme"][data-theme="dark"]`. Get the semantic layer right and a new brand is a JSON file.

## The build

`tokens/build.mjs` (copy from `${CLAUDE_PLUGIN_ROOT}/templates/tokens/build.mjs`) — dependency-free Node, reads the DTCG sources and emits:

| Output | For |
|---|---|
| `dist/tokens.css` | CSS custom properties, one block per theme |
| `dist/tokens.ts` | Typed constants + a `Token` union type for autocomplete |
| `dist/tokens.json` | Flat resolved map — what the inventory site and AI agents read |
| `dist/theme.css` (`@theme`) · `contract.css.ts` · `tokens.stylex.ts` · `preset.ts` | whichever the CSS system needs |

It also runs the **contrast gate**: every `fg`/`bg` semantic pair, in every theme, checked against WCAG. Failures fail the build with the measured ratio and the required one. Contrast as a CI gate rather than a review comment is the single highest-leverage accessibility decision available — it makes the failure impossible to merge rather than easy to miss.

Swap to **Style Dictionary v5** if the team needs its plugin ecosystem or a Figma round-trip via Tokens Studio. Note that full `2025.10` support is still landing in v5; check before relying on the newest spec features.

## Workflow

1. Edit the DTCG JSON. Never the generated files — a hand-edit in `dist/` is erased on the next build and, worse, is a divergence nobody notices until a rebrand.
2. `npm run tokens` — build + contrast gate.
3. Commit **both** source and generated output. Generated files in git make review meaningful: the diff shows what actually changed visually, and consumers do not need the build to use the package.
4. Say which components are affected. The registry records the tokens each component consumes, so this is a lookup, not a guess.

## Anti-patterns

| Smell | Why it hurts |
|---|---|
| `color.primary` with no ramp | Nowhere to go for hover, active, disabled, subtle backgrounds. You will invent them ad hoc and they will not match. |
| Tokens for one-offs (`color.thatBlueOnTheSettingsPage`) | A token used once is a hardcoded value with ceremony. |
| A 20-step spacing scale | Not a scale. Any value is on it, so it constrains nothing. |
| Semantic names that describe appearance | `color.bg.lightGray` is wrong the moment dark mode ships. |
| Primitives referenced in components | Kills theming. This is the one to lint hardest. |
| Themes that redefine primitives | `blue.600` meaning different things in different themes makes every downstream reference unreadable. |
| Skipping the semantic tier "for now" | The tier costs an hour up front and a full-codebase migration later. |
