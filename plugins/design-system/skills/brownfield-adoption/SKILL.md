---
name: brownfield-adoption
description: Use when bringing a design system into an EXISTING codebase - migrating hardcoded values to tokens, replacing one-off components, planning incremental adoption, running the audit-infer-migrate pipeline. Triggers on "adopt the design system", "migrate to tokens", "we already have an app", "incremental migration", "kill the old button", "design system rollout".
---

# Brownfield adoption

Most teams do not start a design system on an empty repo. They start with three years of
product code, four button implementations, ninety hex values, and a deadline. The
greenfield skills in this plugin build the system; this one gets an existing codebase
onto it without a big-bang rewrite — because the big-bang rewrite is the plan that never
ships. Adoption is a **strangler fig**: the system grows around the old code in batches
that each land independently, and the old code dies when nothing references it.

## The order: tokens → layout → components

Not negotiable, because each stage is the substrate of the next:

1. **Tokens first.** Every component migration rewrites styles; if tokens land after
   components, every component gets touched twice. Tokens also deliver the first visible
   win (dark mode, rebrand-readiness) without changing a single component API.
2. **Layout primitives second** (Box/Stack/Inline). They absorb the `display:flex` divs
   that are 40% of any migration diff, and they make every subsequent component swap
   smaller because spacing stops being part of the swap.
3. **Shadow components last**, one roadmap equivalent at a time, worst offender first —
   where "worst" = the audit's cost × blast-radius ranking, not whichever one annoys
   the team most.

## The pipeline

`/design-system:adopt` runs this; the judgement lives here.

1. **Measure** — `/design-system:audit` writes the dated drift report. No migration
   without a baseline: the diff between two dated reports *is* the progress metric,
   and "we feel like adoption is going well" is not a number.
2. **Infer tokens** — `${CLAUDE_PLUGIN_ROOT}/templates/adopt/infer-tokens.mjs` scans the
   codebase's hardcoded values, clusters colours in OKLCH, and proposes the five primitive
   ramps from the codebase's *own hues* plus a 4px-grid snap map. Dry-run first, always:
   the coverage numbers ("5 ramps + snap map cover N of M hardcoded values") are what the
   team says yes to, not the JSON.
3. **Gate** — copy the token templates, apply the inferred ramps, run `tokens/build.mjs`.
4. **Plan** — write `.design-system/adoption-plan.md` in batches (see below).
5. **Rewrite the mechanical batch** — `infer-tokens.mjs --rewrite-css` for exact colour
   literals in CSS; the `value-to-token` codemod for inline styles and CSS-in-JS. Only
   **exact** matches are mechanical. A snap (17px → 16px) or nearest-colour match changes
   what users see, so it ships in a reviewed batch with a screenshot diff, not a codemod.
6. **Re-measure** — run the audit again, report the delta. If batch 1 didn't move the
   numbers, the value map was wrong; find out why before batch 2.

## When the contrast gate rejects the inherited palette

It will. The codebase's grey-on-white body text at 4.2:1 was shipped by hand; the gate
does not care about the git history. **A failing inferred ramp is a finding, not a
blocker** — it means the product has been shipping a contrast failure, and the gate has
just given you the receipt. Three legitimate responses, in order of preference:

1. **Accept the corrected step.** The inferred ramp holds the codebase's hue but the
   recipe's lightness; the visual delta is usually invisible (L shifts of 0.02–0.05) and
   the pair now passes. This is the default: the rebrand nobody notices.
2. **Re-point the semantic token** at a different step (a light-peaking brand hue's solid
   fill belongs at 700, not 600 — same rule as the palette importer).
3. **Mark a genuine exemption** (`$extensions["design-system"].contrast`) for decorative
   pairs. Rare. If you are writing more than a couple of these, you are laundering
   failures, and the gate's history will show who signed them.

Never widen the gate itself. The gate is the one part of the migration that must be
worth trusting at the end.

## The lint ratchet

Install the lint plugin on day one, at **warn**, scoped to nothing. Then ratchet:

- Batch lands → the batch's directories flip to **error**. New code in migrated areas
  cannot regress; unmigrated areas are not spammed with warnings nobody reads.
- The ratchet config is the adoption map. `overrides: [{ files: ['src/checkout/**'],
  rules: { 'design-system/no-raw-color': 'error' } }]` is both enforcement and
  documentation of what has been claimed.
- Turning a rule to error repo-wide before its batch migrated is the classic way to
  train a team to `eslint-disable`. The ratchet exists so that never pays.

## Shadow components

The audit lists local implementations that duplicate roadmap components. For each:

- **Map it** to its registry/roadmap equivalent (the recipes in
  `design-system-architect/references/recipes/` say what each equivalent covers).
- **Diff the API surface**, not the pixels: what props does the shadow have that the DS
  component lacks? Each gap is either (a) covered by an existing prop under another
  name — codemod it, (b) a real gap — file it against the DS before migrating, or
  (c) a misfeature the DS refuses on purpose (a `color` prop taking hex) — the migration
  is where it dies, with a note in the PR saying why.
- **Register the shadow** in the registry's `shadowImplementations` while it lives, so
  the inventory shows the debt and the adoption count shows it shrinking.
- Migrate call sites in batches by directory, not all at once — a 400-file component PR
  cannot be reviewed, and unreviewable is unshippable.

## Metrics that keep the effort funded

- **Drift counts** from dated audit reports (`.design-system/audit-<date>.md`), diffed.
- **Adoption counts** from the registry — usages of DS components in product code are
  scanned per component; the trend is the story.
- **Shadow-component count**, monotonically down.
- Report per quarter in exactly those three numbers. Adoption efforts get defunded when
  progress is invisible, not when it is slow.

## Anti-patterns

| Smell | Why it fails |
|---|---|
| Big-bang branch migrating everything | Unreviewable, permanently stale against main, dies in rebase hell. Batches or nothing. |
| Migrating pixels but not APIs (`<Button color="#2563eb">`) | You now have drift *inside* the system. The escape hatch became the front door. |
| Turning every lint rule to error on day one | Trains the team to disable the plugin before it earns trust. |
| Inferring tokens from a Tailwind codebase | It already has a palette. `import-palette.mjs` imports it exactly; inference reverse-engineers it approximately. The script refuses by default for this reason. |
| "We'll fix contrast later" | Later is when the gate blocks a release. The corrected steps in the inferred ramp cost nothing today and a redesign in a year. |
| Deleting the shadow component before its last call site migrated | The team that still needs it re-copies it from git history, and now it is invisible to the audit. Deprecate loudly, delete when the count is zero. |
