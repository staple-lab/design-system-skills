# Figma variables ⇄ DTCG mapping

The rules `templates/figma/variables-to-dtcg.mjs` implements, and the judgement behind
them. Checkable against the script and the fixture (`templates/figma/fixtures/`).

## Collections and modes → files

| Figma shape | DTCG file | Why |
|---|---|---|
| Collection with **one mode** | `primitive.tokens.json` | One value regardless of theme = theme-independent = the primitive tier's definition. Collection name is ignored — the *path* determines tier (see `design-tokens/references/naming.md`). |
| Collection with **N modes** | `semantic.<mode>.tokens.json` × N | Figma modes are themes. Mode names are lowercased/kebab-cased: `Light` → `semantic.light.tokens.json`. A mode named anything but a theme (`Compact`, `Mobile`) still becomes a `semantic.<name>` file — rename it or move those variables before converting; density belongs in `density.<name>.tokens.json`, which Figma modes cannot express (they re-value per collection, not per token subset). |

## Names → paths

`/`-separated Figma names become dot paths; segments are trimmed, lowercased,
inner spaces kebab-cased: `color/bg/accent` → `color.bg.accent`, `Feature Flags/new nav`
→ `feature-flags.new-nav` (and then skipped — see types). Two Figma names that collide
after normalisation (`Color/BG` and `color/bg`) last-write-win — fix the Figma naming,
don't fix the converter.

**The tier classifier still applies.** A pulled `color/bg/accent` classifies semantic by
path shape; a pulled `brand/blue` classifies primitive. If designers use a grouping
grammar different from the system's (`Colours/Brand/Primary`), map the names in Figma
first — the converter transliterates, it does not translate.

## Types → `$type`

| Figma `resolvedType` | DTCG | Notes |
|---|---|---|
| `COLOR` | `color`, hex | rgba floats → `#rrggbb`, alpha kept as 8-digit hex only when < 1. OKLCH authoring stays a code-side practice; Figma stores sRGB, so a pull flattens `oklch(...)` to its hex — expect `--diff` noise on ramps authored in OKLCH and pulled back. |
| `FLOAT` | `dimension` `{value, unit: 'px'}` | Except path heads `z`, `opacity`, `font-weight` → plain `number`. Figma floats are unitless; px is the only defensible default, and rem-based scales should stay code-owned. |
| `BOOLEAN`, `STRING` | **skipped**, with a note | Component logic and content, not design decisions. A `STRING` font-family variable is the one loss here — add it to `type.*` by hand. |
| alias (`VARIABLE_ALIAS`) | `{target.path}` reference | Alias chains are preserved, not flattened — the reference IS the information. An alias into a variable the pull did not include becomes a dangling reference the token build dies on, which is correct: pull the whole graph or none of it. |

## What does not round-trip

State it in the PR rather than letting someone discover it:

- **Composite type tokens** (`type.body` = size+line-height+weight+spacing): Figma holds
  these as *text styles*, not variables. Pull does not touch them; push flattens them.
- **Shadows/elevation**: *effect styles* in Figma, composite pairs in DTCG. Same.
- **Density and brand overlays**: no Figma equivalent (modes re-value a whole
  collection, not a token subset per attribute). Code-owned, `--diff` will list them as
  code-only — that listing is expected, not drift.
- **`$description` ↔ variable description** round-trips and is worth curating in
  whichever tool the team actually writes docs in.
- **Contrast metadata** (`$extensions["design-system"].contrast`): code-only. A pull
  never carries exemptions with it — they must be re-justified in review.
