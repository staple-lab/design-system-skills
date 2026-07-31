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

Files, in `tokens/` — the names are load-bearing, the build dispatches on them:

| File | Contains |
|---|---|
| `primitive.tokens.json` | Raw ramps and scales. No references. Theme-independent. |
| `semantic.<theme>.tokens.json` | Meaning, one file per theme. Same paths in every theme — a missing path is a hole. |
| `component.tokens.json` | Per-component knobs. All references. |
| `density.<name>.tokens.json` | Optional. Theme-independent re-values of *existing* tokens → a `[data-density='<name>']` block. |
| `brand.<name>.tokens.json` | Optional. A brand's primitive palette, applied to every theme → `[data-brand='<name>']` blocks. |
| `brand.<name>.<theme>.tokens.json` | Optional. Brand semantic re-points for one theme, for when the brand hue's contrast behaviour differs. |

The default theme, density and brand are the plain document: no file suffix, no attribute. `comfortable` density is whatever the base files say, not a `density.comfortable` file.

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

The grammar is an API, not a labelling convention — four tools parse it (the lint rules, the registry scanner, the inventory site, and the build's contrast gate, which discovers its pairs *by name*). Read `references/naming.md` for the exact contract: the `tier()` path classifier and its trap (a new top-level category silently defaults to the *component* tier), why state suffixes hang off the role with a hyphen rather than a new dot segment, and why the `--ds-` prefix is the only configurable part of a name.

## The scales

Read `references/scales.md` for the full construction method. In brief:

- **Colour** — build ramps in **OKLCH**, not HSL. HSL's lightness is not perceptual: `hsl(60 100% 50%)` (yellow) and `hsl(240 100% 50%)` (blue) claim the same lightness and differ by a factor of ~8 in perceived brightness, so an HSL ramp gives you steps that look evenly spaced in some hues and badly bunched in others. OKLCH lightness matches perception, so one ramp recipe works across every hue. 12 steps per ramp (a 50–950 scale) covers surfaces, borders, fills and text.
- **Spacing** — a 4px base grid, geometric-ish: `0, 1, 2, 4, 6, 8, 12, 16, 24, 32, 48, 64, 96`. Not every multiple of 4 — a scale with too many rungs is not a scale, it is permission.
- **Type** — a modular scale (1.200 minor third for dense UI, 1.250 for standard product, 1.333+ for editorial), with `clamp()` for fluid sizes at display end. Line height is inverse to size: tight for headings (1.1–1.25), open for body (1.5–1.6).
- **Radius / elevation / motion / z-index** — small, closed sets. Elevation especially: 4 levels maximum, each a *pair* of shadows (a tight contact shadow + a diffuse ambient one) or it looks flat and fake.
- **Border width** — `none 0 · sm 1px · md 2px · lg 4px`. 1px is the default everywhere; 2px is emphasis (focus, selection); 4px is an indicator bar, not an outline.
- **Opacity** — one token, `opacity.disabled = 0.5`, and the smallness is the point: opacity on text silently destroys the ratios the contrast gate enforces, so text dimming goes through `color.fg.muted` / `color.fg.disabled` (which the gate can see), and whole-element fades are the only legitimate use.

### Importing a vendor palette

When the team is already on Tailwind or Radix Colors, do not hand-transcribe hex values into the ramps — run the importer (copy from `${CLAUDE_PLUGIN_ROOT}/templates/tokens/import-palette.mjs` into the project's `tokens/` if it is not there):

```bash
node tokens/import-palette.mjs --source tailwind --accent orange --neutral slate --dry-run
node tokens/import-palette.mjs --source radix --accent indigo --neutral slate
node tokens/build.mjs   # the contrast gate validates the imported palette
```

It rewrites the five colour ramps inside `primitive.tokens.json` from the **locally installed** package (nothing vendored — you get the palette version in the project's lockfile), mapped onto the same 50–1000 steps the generated ramps use. Both step-mapping tables and their rationale are in `references/scales.md`. The principle is *normalize at the primitive tier*: the semantic layer, the themes and the contrast gate are untouched — `{color.accent.600}` still means "the solid-fill step", it just resolves to a Tailwind or Radix value now. If the gate fails after an import, that is the gate **working**: the vendor step sitting in that slot cannot carry the foreground the semantic layer puts on it, and the failure names the step to swap. Do not weaken the gate.

The trade-off, both ways: a vendor palette buys designer familiarity and one-to-one parity with the swatches in the design tool; the generated OKLCH ramps buy guarantees the vendors do not make — most concretely the neutral 500/600 dual-text constraint (`fg.subtle` ≥3:1 on near-white in light *and* `fg.muted` ≥4.5:1 on near-black in dark), which falls between Tailwind's rungs and has to be interpolated on import.

## Theming

**A theme reassigns semantics. It never redefines primitives.** `blue.600` means the same hex in every theme; `color.bg.accent` is what points somewhere different.

```jsonc
// semantic.light.tokens.json
{ "color": { "bg": { "default": { "$value": "{color.neutral.50}"  } } } }
// semantic.dark.tokens.json — same paths, different targets
{ "color": { "bg": { "default": { "$value": "{color.neutral.950}" } } } }
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

### Multi-brand

One semantic layer, several primitive palettes, `[data-brand="acme"][data-theme="dark"]`. Get the semantic layer right and a new brand is a JSON file:

- `brand.acme.tokens.json` overrides primitive ramps (usually just `color.accent.*`) and applies to **every** theme. The build re-resolves the whole semantic layer against the brand's primitives per theme and emits only the vars that changed: `[data-brand='acme']` for the default theme, `[data-brand='acme'][data-theme='dark']` for the others, plus a `prefers-color-scheme` variant so OS-dark users without an explicit choice get the brand's dark values too.
- `brand.acme.<theme>.tokens.json` re-points semantic tokens for **one** theme. You need this when the brand hue's contrast behaviour differs from the default's — a green brand's solid fill lives at step 700, not 600 (see `references/scales.md`), so `color.bg.accent` must move per theme, not per palette.

**The contrast gate runs on every (brand, theme) pair, and a brand that fails AA fails the build.** That is the point of doing brands in the build instead of in a stylesheet: rebrand-by-hue-swap silently losing button-label contrast is *the* classic multi-brand defect, and the same L 0.565 that gives white text 4.66:1 on the default blue gives 4.98:1 at hue 305 but fails outright on a light-peaking hue. A brand file naming an unknown theme kills the build; a brand with files for some themes but not all warns (missing themes keep base semantics — usually a hole, occasionally intentional).

The template ships `brand.northwind.tokens.json.example` — inert because the loader only reads `*.tokens.json`; rename to activate. The config's `tokens.brands` array is the declaration; the files are the implementation, and the build warns when a declared brand has no file.

### Density

`density.<name>.tokens.json` re-values existing tokens with theme-independent values, emitted as a `[data-density='<name>']` block in `tokens.css`. Two rules, both build-enforced:

1. **Existing tokens only.** A token introduced in a density file would exist only under the attribute and be undefined everywhere else — the build dies on unknown paths (which also catches typos).
2. **Theme-independent resolution.** The build resolves the density overlay against every theme and dies if the results differ — a colour that changes with density would need per-theme density blocks nothing downstream expects. Dimensions and numbers only.

Target the component-tier knobs (`control.height`, `control.padding-x`, `card.padding`), **not** the primitive `space` scale. Re-valuing `space.4` under compact would work — references re-resolve, so everything built on it tightens — but it tightens marketing-page hero rhythm along with the data tables, and it makes every "`space.4` = 16px" description a lie. The shipped `density.compact.tokens.json` drops `control.height.md` 40→32px, which loses the 44px touch target even counting the focus ring: compact is for pointer-first data UIs, never for touch.

## The build

`tokens/build.mjs` (copy from `${CLAUDE_PLUGIN_ROOT}/templates/tokens/build.mjs`) — dependency-free Node, reads the DTCG sources and emits:

| Output | For |
|---|---|
| `dist/tokens.css` | CSS custom properties — one block per theme, plus `[data-brand]` and `[data-density]` override blocks |
| `dist/tokens.ts` | Typed constants + a `Token` union type for autocomplete |
| `dist/tokens.json` | Flat resolved map + `densities`/`brands` lists — what the inventory site and AI agents read |
| `dist/theme.css` (`@theme`) · `contract.css.ts` · `tokens.stylex.ts` · `preset.ts` | whichever the CSS system needs |

It also runs the **contrast gate**: every `fg`/`bg` semantic pair, in every theme *and every brand*, checked against WCAG. Failures fail the build with the measured ratio and the required one. Contrast as a CI gate rather than a review comment is the single highest-leverage accessibility decision available — it makes the failure impossible to merge rather than easy to miss.

**How each CSS system picks up density and brand.** The override blocks are plain attribute-scoped custom properties, which is the one mechanism that works everywhere styles resolve through `var()` — and only there:

| System | Density / brand switching |
|---|---|
| css-modules | Free. Components read `var(--ds-*)`; the attribute blocks in `tokens.css` cascade over them. |
| Tailwind | Free. `theme.css` uses `@theme inline`, so utilities point at the *live* custom properties — flipping `data-density` or `data-brand` restyles with no rebuild. |
| vanilla-extract | Free. The contract maps onto the same `--ds-*` names `tokens.css` defines. |
| StyleX | **Not free.** `tokens.stylex.ts` bakes literal values into `defineVars` (that is what makes it statically analysable), so StyleX's own vars never see the attribute blocks. Generate a `stylex.createTheme` override from `dist/tokens.json` and apply it at the density/brand scope, or point the styles that must switch at `var(--ds-*)` directly. |
| Panda | **Not free.** `preset.ts` feeds Panda raw values and Panda mints its own vars. Either extend the preset with conditions (`compact: '[data-density=compact] &'`) or layer `tokens.css` and reference `var(--ds-*)` where switching matters. |

Density and brand files should touch disjoint tokens (dimensions vs colours — the build's theme-independence rule pushes density that way anyway); if both re-valued the same var, whichever block is emitted later would win with no combined `[data-brand][data-density]` selector to arbitrate.

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
