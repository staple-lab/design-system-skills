---
description: Audit a codebase for design system drift — hardcoded values, one-off components, a11y gaps, unadopted primitives
argument-hint: "[path to audit, defaults to the whole repo]"
---

# Design system drift audit

Scope: `$ARGUMENTS` (default: the whole repo, excluding the design system package itself).

This is a **measurement** task. Produce numbers the team can act on, not adjectives.

Run the six checks below **as parallel subagents dispatched in a single message** — they are read-only and independent of each other, so run together they cost the slowest check, not the sum of all six. Give each subagent one numbered check and have it return counts by file (worst offenders first), not prose; the parent merges and ranks. Only fall back to running them inline (as parallel tool calls per batch) if the scope is a single small directory.

1. **Hardcoded values that should be tokens.** Grep the product code for raw hex/rgb/hsl colours, `px` values outside the spacing scale, raw `font-family`/`font-size`, hardcoded `z-index`, raw durations/easings. Report count by file, worst offenders first. If the lint plugin is installed, run it instead of grepping — it has fewer false positives.
2. **Shadow components.** Find local implementations that duplicate a registry component (a hand-rolled `<button className="...">`, a bespoke modal, a custom dropdown). Cross-reference against `.design-system/registry.json`. These are the real adoption cost.
3. **Deep imports.** Anything importing from inside the design system package rather than its public entry points — these break the moment the package refactors.
4. **Accessibility.** Run the a11y lint pass over product code; flag missing labels, non-semantic interactive elements (`onClick` on a `div`), missing focus styles, images without alt.
5. **Deprecated API usage.** Registry entries marked deprecated, still in use, with the migration each one needs.
6. **Token coverage.** Which semantic tokens exist but are used nowhere (dead tokens), and which components consume primitives directly (tier violation).

Deliver a report ranked by **cost to fix × blast radius**, with a concrete migration order — batch 1 is the mechanical codemod-able stuff, batch 2 the judgement calls. Offer to write the codemod for batch 1.

Write the report to `.design-system/audit-<YYYY-MM-DD>.md` so the next audit can diff against it, and state the top-line numbers in chat.

If the numbers warrant action, point at `/design-system:adopt` — it consumes this report
as its baseline and turns it into an inferred token layer, a batched migration plan and
the mechanical rewrites. Audit measures; adopt moves.
