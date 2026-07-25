# Templates

These are the **tested versions**. Copy and adapt them rather than writing equivalents from memory — the two build scripts in particular have had real bugs fixed in them that a fresh rewrite would reintroduce.

```
config/        design-system.config.json — the brief, plus its JSON schema
tokens/        DTCG sources (primitive · semantic.light · semantic.dark · component)
               + build.mjs — the token engine and contrast gate
registry/      registry.schema.json + build-registry.mjs — the catalogue generator
components/    reference Button (Tailwind/CVA and CSS Modules forms), meta file, cn helper
testing/       the contract test suite, vitest config and jsdom setup
lint/          eslint-plugin-design-system.mjs (4 rules), eslint + stylelint config
inventory/     the catalogue site — Vite + React, reads registry.json and tokens.json
package/       package.json for a published system, and the CI workflow
```

## The two scripts

Both are **dependency-free Node ESM**, on purpose: they run in CI, in a pre-commit hook, and on a designer's machine that has never run `npm install`.

### `tokens/build.mjs`

```bash
node tokens/build.mjs           # build
node tokens/build.mjs --check   # fail if the committed output is stale
```

Reads `tokens/*.tokens.json`, resolves `{references}` per theme, and emits to `tokens/dist/`:

| Output | For |
|---|---|
| `tokens.css` | CSS custom properties — shared values in `:root`, per-theme blocks, plus a `prefers-color-scheme` block that yields to an explicit `[data-theme]` |
| `tokens.ts` | Typed `var()` map + a `TokenName` union |
| `tokens.json` | Flat resolved map with hex, tier and description — what the inventory, the lint rules and AI agents read |
| `theme.css` / `contract.css.ts` / `tokens.stylex.ts` / `preset.ts` | Whichever the configured CSS system needs |

It also runs the **contrast gate**: every `color.fg.*` paired against `color.bg.*` by naming convention (`fg.on-accent` ↔ `bg.accent`), in every theme. Failures exit non-zero with the measured and required ratios. Per-token overrides live in `$extensions["design-system"].contrast` — `{ min: 3 }` for decorative foregrounds, `{ skip: true }` for disabled text, which WCAG exempts.

It implements OKLCH → sRGB conversion so ramps can be authored perceptually and still be checked numerically.

### `registry/build-registry.mjs`

```bash
node scripts/build-registry.mjs --agents   # build + write AGENTS.md
node scripts/build-registry.mjs --check    # fail if the committed registry is stale (CI)
```

Per component, it merges:

- **props** — extracted from the real TypeScript types. Follows intersections (`type ButtonProps = ButtonBaseProps & (… | …)`), reads JSDoc including `@default` and `@deprecated`, picks defaults up from the destructure *and* from CVA `defaultVariants`, and reads `variant`/`size` out of the CVA config — those come from `VariantProps<typeof …>` inference, which no amount of type-text parsing can resolve. If `react-docgen-typescript` is installed it is used instead.
- **tokens consumed** — scanned from the styles and resolved against `tokens/dist/tokens.json` for exact paths. (The naive inverse of a CSS var name is wrong: `--ds-color-bg-accent-hover` is `color.bg.accent-hover`, not `color.bg.accent.hover`.) Unknown `--ds-*` references are reported — they resolve to nothing at runtime and fail silently.
- **tests + a11y** — from the last `vitest --reporter=json` run.
- **lint** — from the last `eslint -f json` run.
- **adoption** — usage counts scanned from product code.
- **judgement** — status, guidance, do/don't, examples, keyboard map, a11y notes, from `<Name>.meta.json`.

`--check` in CI is what makes "the docs are always current" true rather than aspirational.

## Verifying a change

```bash
# token engine, across every CSS system
for s in css-modules tailwind vanilla-extract stylex panda; do
  echo "{\"stack\":{\"cssSystem\":\"$s\"}}" > design-system.config.json
  node tokens/build.mjs || exit 1
done

# the gate must actually fail — break a pair and confirm a non-zero exit
node tokens/build.mjs --check

# registry
node scripts/build-registry.mjs && node scripts/build-registry.mjs --check
```

## Notes

- The reference `Button` ships in **two styling forms** deliberately. That is the proof the token layer is the real system and the CSS layer is swappable — every value in both is a token.
- `components/Button/Button.tsx` implements the `render` polymorphism prop inline to stay dependency-free. On Base UI, `useRender` does it properly including ref merging; on Radix, `asChild` + `Slot`.
- The inventory site is styled entirely with the system's own tokens. That is dogfooding, not tidiness: a token that does not work shows up here before it reaches a product.
