# design-system-skills

Staple Lab's toolkit for developing design systems and frontends, packaged as a Claude Code marketplace.

## Install

```
/plugin marketplace add staple-lab/design-system-skills
/plugin install design-system@design-system-skills
```

Then run `/design-system:init` in any React repo.

## Plugins

### [`design-system`](plugins/design-system)

Interview-driven design system builder for React. It asks which primitive layer (Base UI, Radix, React Aria), component layer (shadcn-style, MUI, Mantine…), CSS system (Tailwind v4, CSS Modules, StyleX, vanilla-extract, Panda), motion library (Motion, GSAP) and colour/typography direction you want — then scaffolds the whole system.

The organising idea: **one machine-readable registry, four consumers.**

```
      design-system.config.json      the brief (what we chose, and why)
      tokens/*.tokens.json (DTCG)    the values
      src/**/*.tsx + TS types        the components
                    │
                    ▼  generated, never hand-written
            .design-system/registry.json
                    │
      ┌─────────────┼──────────────┬───────────────┐
      ▼             ▼              ▼               ▼
  inventory     AGENTS.md       lint rules      test matrix
    site      (AI contract)   (enforcement)   (behaviour)
```

Docs drift from code because they get written twice. Props tables are extracted from the real TypeScript types, tokens consumed are scanned from the styles, and test/a11y/lint figures are the measured results of the last run — so the catalogue cannot be out of date, and neither can the file the AI agents read.

**What ships:**

- **DTCG design tokens** in three tiers, with OKLCH colour ramps tuned by measurement and a **contrast gate that fails the build** — not a review comment.
- **A dependency-free token build** emitting CSS custom properties, TypeScript types, and Tailwind `@theme` / vanilla-extract contract / StyleX vars / Panda preset.
- **A component inventory site** in the spirit of Atlassian, Polaris and Geist — props tables, keyboard maps, do/don't pairs, adoption, status board, token explorer with live theme and density switching.
- **A behavioural contract test suite** — keyboard, focus restoration, controlled/uncontrolled parity, escape hatches, axe per variant.
- **Four custom ESLint rules** that read the generated token file, so lint and tokens cannot disagree.
- **Packaging** — exports maps, `sideEffects`, RSC boundaries, changesets, publint/attw.

Commands: `/design-system:init` · `:component` · `:tokens` · `:inventory` · `:audit` · `:publish`

See the [plugin README](plugins/design-system/README.md) for the full picture.

## Repo layout

```
.claude-plugin/marketplace.json
plugins/design-system/
  .claude-plugin/plugin.json
  commands/     6 slash commands
  skills/       10 skills (architect, tokens, primitives, CSS, API, motion,
                inventory, testing, linting, packaging)
  agents/       component author · accessibility auditor
  templates/    the tested scaffolding — token build, registry builder,
                reference components, contract tests, lint plugin,
                inventory app, packaging + CI
```

## Contributing

The `templates/` scripts are executable and verified, not illustrative. If you change `tokens/build.mjs` or `registry/build-registry.mjs`, run them against the fixtures before committing — both are dependency-free Node and run standalone. See [templates/README.md](plugins/design-system/templates/README.md) for the verification commands.

## Licence

MIT
