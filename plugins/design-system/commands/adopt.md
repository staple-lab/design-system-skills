---
description: Adopt the design system in an existing codebase — infer tokens from current values, plan the migration in batches, run the mechanical rewrites, measure the delta
argument-hint: "[path to adopt, defaults to the whole repo; or a stage: 'infer', 'plan', 'batch 1', 'remeasure']"
---

# Adopt the design system in a brownfield codebase

Scope: `$ARGUMENTS`

Invoke the `brownfield-adoption` skill — it owns the judgement (adoption order, the lint
ratchet, what the contrast gate's rejections mean, shadow-component handling). This
command is the pipeline. A design system must already exist or be initialised first: if
there is no `design-system.config.json`, offer `/design-system:init` and stop.

1. **Baseline.** Run `/design-system:audit`'s six checks (or reuse today's report if one
   exists in `.design-system/`). No migration without a baseline number.

2. **Infer.** Run `${CLAUDE_PLUGIN_ROOT}/templates/adopt/infer-tokens.mjs` (copy to
   `adopt/` in the project if not present) as a **dry run**. Present the proposal as
   coverage numbers: "5 ramps from your own hues + the 4px snap map cover N of M
   hardcoded values; X are mechanically rewritable today." If it detects Tailwind it
   will skip colours and say to use `import-palette.mjs` — follow that. Ask the user
   (AskUserQuestion) to accept the ramps, adjust hues, or keep an existing palette
   before writing anything.

3. **Gate.** `--write` the accepted ramps into `tokens/primitive.tokens.json`, run
   `node tokens/build.mjs`. Gate failures on inherited colours are findings — the skill
   says which of the three responses applies; never weaken the gate to get past them.

4. **Plan.** Write `.design-system/adoption-plan.md`: batch 1 = the mechanical rewrites
   (exact matches from `value-map.json`); batch 2+ = judgement batches by directory —
   snapped dimensions, nearest-colour swaps, then shadow components mapped to their
   roadmap equivalents (link each to its recipe). Every batch small enough to review.

5. **Rewrite batch 1** on approval: `infer-tokens.mjs --rewrite-css` for CSS files, the
   `value-to-token` codemod (via `codemods/bin/codemod.mjs`) for inline styles and
   CSS-in-JS. Show the diff stat, run the project's tests and a visual check before
   committing anything.

6. **Re-measure.** Run the audit again and report the delta against the baseline —
   drift count, mechanically-covered count, shadow components remaining. That delta is
   the deliverable; "migrated some files" is not.

Set up the lint ratchet as part of batch 1: plugin installed at warn everywhere, error
in migrated directories only, per the skill's ratchet section.
