---
name: icon-system
description: Use when adding icons to a design system or choosing an icon strategy - picking an icon library (Lucide, Phosphor, Radix Icons, custom SVG pipeline), building the Icon wrapper component, icon sizing against text, icon accessibility (decorative vs meaningful, icon-only buttons), and how icons are packaged without blowing up the bundle. Triggers on "icons", "icon set", "icon component", "icon library", "add icons to the design system", "svg icons".
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
Feather: 24px grid, 2px stroke, `currentColor` by default, per-icon ESM exports that
tree-shake cleanly, ISC licence, very active coverage growth. Its stroke-based style sits
neutrally in almost any brand, which is the right property for a default.

The alternatives, and what each trades:

- **Phosphor (`@phosphor-icons/react`)** — much larger set with six weights
  (thin→fill) selectable per icon. Choose it when the design language needs weight
  variation (e.g. filled icons for selected states). Costs: the weight axis is one more
  decision every usage makes, and per-icon bundle size is a little heavier than Lucide.
- **Radix Icons** — 15px grid, crisp at small sizes, pairs naturally with Radix
  Primitives. Costs: ~300 icons, so coverage runs out fast, and the 15px grid fights a
  16/20/24 sizing scale.
- **Custom SVG pipeline** — brand-differentiated icons compiled from a `svg/` directory
  (SVGO to normalise, SVGR to emit components). The only option when icons *are* the
  brand. Costs: you own the grid, the stroke discipline, the optimisation config and the
  coverage gap forever — budget a designer, not just a build script.

Whichever you pick, the library is a **dependency of the design system, not part of its
API**. Consumers meet icons through the wrapper below; swapping Lucide for Phosphor later
is then a change to import sites inside the DS, not a breaking change for every product.

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
1,500 rows of `ArrowLeft` would bury the 30 components that need finding. Instead, record
the chosen library and its version in `design-system.config.json` with a `rationale`, and
let the inventory's Icon page link to the library's own searchable catalogue.
