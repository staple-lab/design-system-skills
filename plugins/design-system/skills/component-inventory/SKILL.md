---
name: component-inventory
description: Use when building or updating the design system's catalogue site and its machine-readable registry - component gallery, auto-extracted props tables, token explorer, lifecycle/status board, adoption metrics, a11y and test status, and the generated AGENTS.md that gives AI coding agents the same source of truth. Triggers on "design system docs", "component inventory", "storybook alternative", "props table", "catalogue".
---

# Component inventory

The inventory is the design system's **catalogue** — the page a developer opens to answer "does this already exist, what is it called, and how do I use it". Storybook is the *workbench* (isolated development, interaction testing); the inventory is the *shop window*. Teams that run both use them for different jobs; teams that run one usually want this one.

References worth copying from: **Atlassian Design System** (the props tables and the do/don't pairs), **Shopify Polaris** (guidance quality and content standards), **Vercel Geist** (density, keyboard navigation, restraint), **Adobe Spectrum** (the accessibility documentation depth).

## The registry is the product

```
source of truth  →  .design-system/registry.json  →  ┬→ inventory site
(code + tokens)      (generated, never hand-written)  ├→ AGENTS.md (AI contract)
                                                      ├→ lint rule data
                                                      └→ adoption + coverage reports
```

Docs drift from code because they are written twice. **Generate the registry from the source**, then everything downstream is a view. If a fact appears in the site but not in the registry, you built it wrong.

What is generated versus authored:

| Field | Source |
|---|---|
| props (name, type, default, required, description) | `react-docgen-typescript` over the real types |
| tokens consumed | static scan of the component's styles |
| test + a11y status | last Vitest/axe run (`--reporter=json`) |
| lint violations | last ESLint run |
| bundle size | build output per entry |
| adoption / usage count | scan of consuming code |
| status, since, description, do/don't, guidance | authored in the component's `.meta.ts` — judgement cannot be extracted |

The build script is `${CLAUDE_PLUGIN_ROOT}/templates/registry/build-registry.mjs`; the schema is `registry.schema.json`.

## What every component page must show

This is the bar. Anything less and people go read the source instead — which is fine once and fatal at scale.

1. **Live examples**, per variant and per state, with the code visible and copyable. Interactive, not screenshots.
2. **Complete props table** — name, resolved TypeScript type, default, required, description, deprecation notice. Auto-extracted, so it cannot be wrong.
3. **Anatomy** — the named parts of a compound component, so `Dialog.Footer` is discoverable without reading the exports.
4. **Keyboard map** — every key, in a table. The most-consulted section of any good design system's docs, and the most commonly missing.
5. **Accessibility notes** — the roles and ARIA the component provides, what the *consumer* still owes (an accessible name for icon-only usage), and known limitations. State them; a documented gap is a decision, an undocumented one is a surprise.
6. **Do / don't pairs**, rendered side by side. The single highest-signal piece of guidance you can write — it takes ten seconds to absorb and prevents the misuse that a paragraph of prose does not.
7. **Status badge** — `draft` / `beta` / `stable` / `deprecated`, plus the version it landed in and, for deprecations, the migration.
8. **Tokens consumed** — links back to the token explorer.
9. **Test + a11y status** — the actual last-run result, with the count of behavioural tests and the axe verdict. Not a claim, a number.
10. **Adoption** — where it is used, and what unmigrated hand-rolled equivalents still exist.

## System-level pages

- **Foundations** — colour (every ramp with its measured contrast ratios against the surfaces it is used on), type scale rendered at real size, spacing, radius, elevation, motion with playable examples.
- **Token explorer** — searchable and filterable by tier, with copy-to-clipboard of the token name *and* the `var()`. Theme and density switchers apply live to the whole site, which is also the fastest way to spot a component that never got dark-mode treatment.
- **Status board** — every component in one table: status, test coverage, a11y, bundle size, adoption. This is the page a design system lead opens on Monday, and it is what turns "we should improve the system" into a ranked list.
- **Getting started** — install, theme setup, the first component, and the escape-hatch policy.
- **Contribution** — how a component graduates draft → stable, who reviews, what the bar is. A system with no gate becomes a junk drawer within a year.

## Search

Make it good, and make it keyboard-first (`/` or `⌘K`). Index component names, prop names, token names, *and synonyms* — someone looking for "dropdown" must find `Select` and `Menu`, and someone typing "modal" must find `Dialog`. The synonym list is authored in the meta file and is worth ten minutes of thought per component: failed search is the main reason people build a duplicate.

## The AI contract — `AGENTS.md`

Generate it from the registry. This is what stops agents inventing component names and hardcoding hexes, and it is the cheapest quality win in the whole system:

```markdown
# Design system: @acme/ui

Import from `@acme/ui`. Never from `@acme/ui/dist/*` or from the primitives directly.

## Rules
- Semantic tokens only: `var(--ds-color-bg-accent)`. Never a raw hex, never `--ds-color-accent-600` (primitive tier).
- Spacing comes from the scale: `var(--ds-space-4)`. Never a raw px value.
- Every interactive element needs a visible `:focus-visible` ring.
- Icon-only buttons require `aria-label` (the type will reject them otherwise).

## Components (24 stable, 3 beta)
| Component | Status | Use for | Don't use for | Props |
|---|---|---|---|---|
| Button | stable | Actions the user takes | Navigation — use Link | variant, size, loading, startIcon, … |
| Dialog | stable | Focused tasks needing a decision | Non-blocking messages — use Toast | open, onOpenChange, … |

## Tokens
Full list: `tokens/dist/tokens.json`. Semantic tier only in components.
```

Keep it **generated and short**. A 4,000-line AGENTS.md is skimmed by agents the same way it is by humans. Link out to the registry JSON for the exhaustive data — an agent can read it on demand, and it is the same file the site renders.

## Building the site

Template: `${CLAUDE_PLUGIN_ROOT}/templates/inventory/` — a Vite + React app that reads `registry.json` and `tokens.json`, styled entirely with the system's own tokens. That last part is deliberate: **the docs site is the system's first consumer**, so a token that does not work shows up here first, and dogfooding is not optional if you want to find these problems before your users do.

Deploy on merge to main. Documentation that requires a local dev server gets read by the person who wrote it and nobody else.

## Keeping it honest

- Regenerate the registry in **CI**, and fail the build if it differs from the committed one. That single check is what makes "the docs are always current" true rather than aspirational.
- Fail the build on a `stable` component with no examples, no do/don't, or an empty a11y section. The bar has to be mechanical or it moves.
- Track **failed searches** if you can. They are a direct list of what people expected to exist — the best roadmap input available.
- Review deprecations quarterly. A deprecation with no removal date is a permanent fixture, and consumers learn to ignore the badge.
