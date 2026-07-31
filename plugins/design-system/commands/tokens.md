---
description: Create, edit, re-theme or rebuild the design token layer (DTCG source → CSS vars, TS types, Tailwind/vanilla-extract/StyleX/Panda output)
argument-hint: "[e.g. 'add a dark theme', 'rebrand primary to #0B5FFF', 'adopt the Tailwind palette (slate + orange)', 'add density tokens', 'rebuild']"
---

# Work the token layer

Request: `$ARGUMENTS`

Invoke the `design-tokens` skill and work from `design-system.config.json` + the DTCG sources in `tokens/`.

Non-negotiables, restated because they are the ones that get broken:

- **Edit the DTCG JSON, never the generated output.** `tokens/*.tokens.json` is the source of truth; `tokens/build.mjs` emits everything else. If you find yourself hand-editing generated CSS, stop — the change belongs upstream.
- **Respect the three tiers.** Primitives (`color.blue.600`) are raw values and are never referenced by a component. Semantic tokens (`color.bg.accent`, `space.gutter`) are what components consume. Component tokens (`button.primary.bg`) exist only where a component genuinely needs its own knob.
- **Theme by re-pointing semantics, not by re-defining primitives.** A dark theme reassigns `color.bg.surface` to a different primitive; it does not change what `blue.600` means.
- **Contrast is a build-time gate, not a review opinion.** Every foreground/background semantic pair gets checked; a failing pair fails the build.

If the request is to adopt a vendor palette (Tailwind, Radix Colors), never transcribe the values by hand. Copy `${CLAUDE_PLUGIN_ROOT}/templates/tokens/import-palette.mjs` into the project's `tokens/` if it is not already there, run it with `--dry-run` first and show the user the resulting diff to `primitive.tokens.json`, then run it for real and `node tokens/build.mjs`. A contrast-gate failure after the import is the gate doing its job — the error names the vendor step to swap; do not weaken the gate to make an import pass.

After any change: run the token build, run the contrast check, run tests, and show the user the diff in the *generated* artifacts (that is what actually ships). If the change alters visual output, list the components affected — the registry records which tokens each component consumes, so this is a lookup, not a guess.
