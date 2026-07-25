---
description: Build or refresh the design system inventory site — component gallery, props tables, token explorer, a11y + test status, adoption board
argument-hint: "[e.g. 'refresh', 'add usage metrics', 'deploy to vercel']"
---

# Design system inventory

Request: `$ARGUMENTS`

Invoke the `component-inventory` skill.

The inventory is not a second copy of the design system — it is a **view over the registry**. `.design-system/registry.json` is generated from the source (props extracted from the TypeScript types, tokens read from the DTCG files, test + a11y status read from the last run). The site renders that. If a fact is in the site but not in the registry, you built it wrong: the AI agents, the lint rules and the docs must all read the same file.

What the inventory must show for every component — this is the bar set by Atlassian Design System, Shopify Polaris and Vercel Geist, and it is the bar to hit:

- live rendered examples with a code view, per variant and per state
- a **complete props table**: name, type (the real resolved TS type), default, required, description, deprecation
- keyboard map and ARIA/a11y notes
- **status/lifecycle badge** (draft → beta → stable → deprecated) and the version it landed in
- do / don't pairs — the guidance that stops misuse
- which **tokens** the component consumes
- **test + a11y status** — pass/fail from the actual last run, not a claim
- adoption: where in the product this component is used, and what raw/legacy implementations still need migrating

Plus system-level pages: foundations (colour with contrast ratios, type scale, spacing, radius, elevation, motion), a token explorer with copy-to-clipboard and theme/density switching, and a status board of the whole library.

Run it, open it, and confirm it renders before saying it works.
