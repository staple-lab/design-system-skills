---
description: Create, edit, re-theme or rebuild the design token layer (DTCG source → CSS vars, TS types, Tailwind/vanilla-extract/StyleX/Panda output)
argument-hint: "[e.g. 'create the token layer', 'add a dark theme', 'rebrand primary to #0B5FFF', 'adopt the Tailwind palette (slate + orange)', 'add density tokens', 'rebuild']"
---

# Work the token layer

Request: `$ARGUMENTS`

Invoke the `design-tokens` skill and work from `design-system.config.json` + the DTCG sources in `tokens/`.

## No token layer yet? Run the creation wizard

If there is no `tokens/*.tokens.json` (search upward from cwd), switch to **creation mode**:

1. **Survey before asking.** Read `design-system.config.json` if it exists (CSS system,
   prefix), check `package.json` for `tailwindcss`, glance at existing CSS for a brand
   colour. Every found fact is a question you skip.
2. **One `AskUserQuestion` round** (≤4 questions): **colour source** (brand hex →
   generated OKLCH ramps · vendor palette (Tailwind/Radix) · extract from existing
   product code · tuned default preset), **type scale ratio** (1.200 minor third,
   recommended for product UI · 1.250 · 1.125 dense · 1.333 editorial), **density**
   (comfortable only · + compact for data-dense UIs), and **CSS system** only if no
   config said so. Collect the actual hex as plain text after the round.
3. **Copy `${CLAUDE_PLUGIN_ROOT}/templates/tokens/`** into the project, write or update
   `design-system.config.json` (`stack.cssSystem`, `tokens.prefix`). Then run the
   chosen colour path — these are the tested scripts, never hand-compute ramps:
   - brand hex → `node tokens/generate-ramps.mjs --accent "<hex>"` — the brand colour
     lands verbatim at its step; heed the script's light-peaking-hue finding if it
     prints one (it names the semantic re-point, e.g. `bg.accent` → `{color.accent.700}`).
   - vendor palette → `node tokens/import-palette.mjs --source tailwind|radix …`
   - extract from product → `node adopt/infer-tokens.mjs` (copy from
     `${CLAUDE_PLUGIN_ROOT}/templates/adopt/`), per the `brownfield-adoption` skill.
   - preset → the template files as shipped; nothing to run.
   If a non-default type ratio was chosen, re-derive the nine `type.*` sizes from the
   scales reference's rounded-pixel method. If compact was declined, delete
   `density.compact.tokens.json`.
4. **Build and show their CSS system's artifact by name**: `node tokens/build.mjs`,
   report the contrast results, then point at the file their stack consumes —
   `dist/theme.css` (`@import` it, Tailwind v4) · `dist/contract.css.ts`
   (vanilla-extract) · `dist/tokens.stylex.ts` (StyleX) · `dist/preset.ts` (Panda
   config `presets`) · `dist/tokens.css` (CSS Modules — just link it). One line each;
   the `css-systems` skill owns the depth.

## Editing an existing layer

Non-negotiables, restated because they are the ones that get broken:

- **Edit the DTCG JSON, never the generated output.** `tokens/*.tokens.json` is the source of truth; `tokens/build.mjs` emits everything else. If you find yourself hand-editing generated CSS, stop — the change belongs upstream.
- **Respect the three tiers.** Primitives (`color.blue.600`) are raw values and are never referenced by a component. Semantic tokens (`color.bg.accent`, `space.gutter`) are what components consume. Component tokens (`button.primary.bg`) exist only where a component genuinely needs its own knob.
- **Theme by re-pointing semantics, not by re-defining primitives.** A dark theme reassigns `color.bg.surface` to a different primitive; it does not change what `blue.600` means.
- **Contrast is a build-time gate, not a review opinion.** Every foreground/background semantic pair gets checked; a failing pair fails the build.

If the request is to adopt a vendor palette (Tailwind, Radix Colors), never transcribe the values by hand. Copy `${CLAUDE_PLUGIN_ROOT}/templates/tokens/import-palette.mjs` into the project's `tokens/` if it is not already there, run it with `--dry-run` first and show the user the resulting diff to `primitive.tokens.json`, then run it for real and `node tokens/build.mjs`. A contrast-gate failure after the import is the gate doing its job — the error names the vendor step to swap; do not weaken the gate to make an import pass.

After any change: run the token build, run the contrast check, run tests, and show the user the diff in the *generated* artifacts (that is what actually ships). If the change alters visual output, list the components affected — the registry records which tokens each component consumes, so this is a lookup, not a guess.
