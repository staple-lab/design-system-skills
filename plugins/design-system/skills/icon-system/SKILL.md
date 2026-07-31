---
name: icon-system
description: Use when adding icons to a design system or choosing an icon strategy - picking an icon library (Lucide, Phosphor, Heroicons, Tabler, Radix Icons, Material Symbols, Iconify, custom SVG pipeline), building the Icon wrapper component, icon sizing against text, icon accessibility (decorative vs meaningful, icon-only buttons), and how icons are packaged without blowing up the bundle. Triggers on "icons", "icon set", "icon component", "icon library", "add icons to the design system", "svg icons", "which icon pack".
---

# Icon system

Icons are the highest-frequency, lowest-ceremony visual element in a product — which is
exactly why they go wrong: twenty ad-hoc `<svg>` pastes with five different sizes and no
accessibility story, before anyone notices there was a decision to make. Make the decision
once, wrap it once, and every icon after that is one import.

## The decision: wrap an existing library

Do not draw an icon set. A competent library ships 1,500+ icons drawn on one grid with one
stroke weight; matching that consistency in-house is a design team's quarter, and the
in-house set will still be missing `chevron-sort-descending` the day someone needs it.

**Default recommendation: Lucide (`lucide-react`).** The maintained continuation of
Feather: ~1,750 icons on a 24px grid with a 2px stroke, `currentColor` by default, ESM
with `sideEffects: false` so named imports from the barrel tree-shake cleanly, ISC
licence, 1.x stable, very active coverage growth. Its stroke-based style sits neutrally
in almost any brand, which is the right property for a default.

## The menu

Current as of **July 2026** — verify with `npm view <pkg> version` before installing, and
prefer a repo's existing pack over anything here (a second icon grid in one product is
worse than either grid alone).

| Pack | Package | Glyphs | Licence | Style | Take |
|---|---|---|---|---|---|
| **Lucide** | `lucide-react` | ~1,750 | ISC | Stroke, 24px grid, 2px | **The default.** Neutral enough for almost any brand. Barrel imports are safe in production; large icon barrels are mainly a *dev-server* cost, and bundler optimisers (e.g. Next's `optimizePackageImports`) cover Lucide out of the box. |
| **Phosphor** | `@phosphor-icons/react` | 1,500+ × 6 weights (9,000+ drawn) | MIT | Stroke thin→bold, plus fill and duotone | Pick when the design language needs a **weight axis** — e.g. `fill` for selected states, `bold` for emphasis. Costs: the axis is one more decision at every call site, and the maintainers themselves warn that importing from the barrel makes dev bundlers transpile all 9,000+ modules — deep-import per icon (`@phosphor-icons/react/dist/csr/<Name>`), and use the `@phosphor-icons/react/ssr` entry in RSC because the default entry reads a weight context. |
| **Heroicons** | `@heroicons/react` | 316 per style × 4 styles | MIT | Both: 24px outline *and* 24/20/16px solid redraws | Tailwind Labs' set — the look of Tailwind UI/Catalyst. You never import from the package root: the style lives in the subpath (`@heroicons/react/24/outline`, `.../20/solid`, `.../16/solid`), which keeps each barrel small and makes mixed-style usage visible in the import line. Deliberately curated, so coverage runs out fast beyond app-chrome basics. |
| **Tabler** | `@tabler/icons-react` | 6,100+ (outline + filled) | MIT | Stroke, 24px grid, 2px, filled twins for many glyphs | Same grid-and-stroke DNA as Lucide with ~3× the coverage — the pick for dense admin/dashboard products that keep needing one more domain glyph. Cost: one giant barrel and **no subpath exports**, so while production tree-shakes fine (`sideEffects: false`), dev cold-starts are notoriously slow without a bundler optimiser (Next lists it in `optimizePackageImports` by default). |
| **Radix Icons** | `@radix-ui/react-icons` | ~300 | MIT | 15×15, thin line-work (drawn as filled paths, not strokes) | Crisp at small sizes, pairs naturally with Radix Primitives. Costs: coverage runs out fast, and the 15px grid fights an em-based 16/20/24 scale — glyphs render slightly under-size next to 24px-grid sets. The barrel is small enough that imports need no ceremony. |
| **Material Symbols** | `material-symbols` (variable font) or `@material-symbols/svg-400` (static SVGs, one package per weight 100–700) | 2,500+ | Apache-2.0 | Variable axes: fill 0–1, weight 100–700, grade, optical size | Google's set, and a **different delivery model**: the canonical form is a variable font, and there is no official per-component React package. The font route renders ligature `<span>`s — text, not SVG — so it does not fit the wrapper contract below without an adapter, but animating fill/weight via `font-variation-settings` is the one trick no SVG pack can do. To consume as components, run the per-weight static SVG packages through SVGR (freezing the axes) or pull glyphs through Iconify. Pick only when the product genuinely speaks Material. |
| **Iconify** (escape hatch) | `unplugin-icons` + `@iconify-json/<set>` (build-time), or `@iconify/react` (runtime) | ~300k across 200+ sets | Framework MIT; **each source set keeps its own licence** | Every style that exists | Not a pack — the escape hatch for "we need one glyph the chosen pack lacks". The build-time route compiles the glyph from local `@iconify-json` data into a plain SVG component: zero runtime, no network, fits the wrapper. `@iconify/react` instead fetches icon data from the Iconify API at render by default — a network dependency in the render path a design system must not have. Route the borrowed glyph through the same `Icon` wrapper and record why in the config `rationale`. |
| **Custom SVG pipeline** | — (SVGO + SVGR from a `svg/` directory) | what you draw | yours | yours | The only option when icons *are* the brand. Costs: you own the grid, the stroke discipline, the optimisation config and the coverage gap forever — budget a designer, not just a build script. |

Two patterns worth reading out of that table. **Style axis**: Lucide/Tabler are
stroke-only, Heroicons and Phosphor give a filled counterpart, Material Symbols makes
fill a continuous axis — if the design uses filled-vs-outline as a state signal
(selected nav items), pick a pack that has both *before* you need it. **Import story**:
every pack tree-shakes in a production build with a modern bundler (all ship ESM with
`sideEffects: false`); they differ in *dev-time* cost and in whether the package gives
you subpaths to dodge the barrel (Heroicons and Phosphor do, Lucide and Tabler rely on
the bundler's import optimiser, Radix is too small to care).

## How the choice flows through the system

- **`stack.icons` in `design-system.config.json`** records the pack, with the reasoning
  in `rationale.icons` — same as every other stack decision. The registry and `AGENTS.md`
  read it from there; nothing else re-states which pack the system uses.
- **The wrapper stays source-agnostic**, so the pack is a **dependency of the design
  system, not part of its API**. Consumers meet icons through the wrapper below;
  swapping Lucide for Phosphor later is an import codemod across DS-internal call sites
  plus a config edit — not a rewrite, and not a breaking change for every product.
- **The never-barrel-re-export rule (below) applies to every pack on this menu**,
  including the small ones — ~300 Radix icons in every consumer's graph is a smaller
  blowout than 6,000 Tabler icons, but it is still a blowout.

## The wrapper contract

Template: `${CLAUDE_PLUGIN_ROOT}/templates/components/Icon/Icon.tsx` (with
`Icon.meta.json` beside it). It is source-agnostic — it takes the icon component as a
prop rather than importing any set — so it works unchanged with Lucide, Phosphor, or your
own SVGR output, and `lucide-react` is recommended but never a dependency of the template.

The contract it enforces:

- **Sizes are a scale, not a number.** `size="sm" | "md" | "lg"` — never a free
  `size={17}` prop, for the same reason spacing is a scale. The template sizes in `em`
  (`1em` / `1.25em` / `1.5em`), which in 16px body text is the classic 16/20/24 mapping
  — and, because it is relative, an icon next to `body-sm` text shrinks with it, so
  icon/text pairs stay matched at every type size without anyone auditing call sites. If
  the system later needs pixel-fixed icons (toolbar grids, virtualised lists), add an
  `icon.size` set to `component.tokens.json` and point the scale at
  `var(--ds-icon-size-*)` — a raw px in the component is still a lint error.
- **Colour is `currentColor`.** An icon inherits the text colour of its context, so a
  danger Button's icon is automatically the right red. An icon that needs its own colour
  takes a semantic token — never a hex, same lint rules as everything else.
- **Decorative by default: `aria-hidden="true"`.** Almost every icon sits next to text
  that already says the thing ("⌫ Delete" — the icon adds nothing for a screen reader).
  The escape hatch is a `label` prop for the rare genuinely meaningful icon (a status dot
  with no text), which renders `role="img"` + `aria-label` instead.
- **Icon-only buttons are Button's job, not Icon's.** `Button` already rejects an
  icon-only usage without `aria-label` at the type level; Icon staying `aria-hidden`
  inside it is correct — the *button* has the name, and a labelled icon inside a labelled
  button announces twice.

## Packaging: never barrel re-export an icon set

The rule from `packaging-distribution`: icons are the classic bundle blowout.
`export * from 'lucide-react'` in your barrel puts every icon in the graph for every
consumer, and it is the single most common way a component library silently gains
hundreds of kilobytes. Consumers import icons directly from the icon package and pass
them to `Icon` (or to Button's icon slots). The DS re-exports the `Icon` wrapper — one
component — and nothing else.

## Registry and meta expectations

`Icon` is one registry entry, like any component: `Icon.meta.json` carries the sizing
rules, the decorative-vs-meaningful guidance as do/don't pairs, and synonyms ("svg",
"glyph", "pictogram") so search finds it. Individual icons are **not** registry entries —
1,500 rows of `ArrowLeft` would bury the 30 components that need finding. Instead, the
chosen pack lives in `stack.icons` in `design-system.config.json` (with `rationale.icons`),
and the inventory's Icon page links to the pack's own searchable catalogue.
