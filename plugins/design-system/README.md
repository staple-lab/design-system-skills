# design-system

A Claude Code plugin that builds and maintains **production React design systems** — for the teams who own them, and for the AI agents that write code against them.

It interviews you for your stack, then scaffolds a system where **one machine-readable registry** feeds the docs site, the AI contract, the lint rules and the test matrix. Docs drift from code because they get written twice; here they get written once and generated.

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

## Install

```
/plugin marketplace add staple-lab/design-system-skills
/plugin install design-system@design-system-skills
```

## Commands

| Command | Does |
|---|---|
| `/design-system:init` | The interview + full scaffold. Start here. |
| `/design-system:component <name>` | Adds a component — API, styles, tests, docs, registry entry |
| `/design-system:tokens <change>` | Create, edit, re-theme or rebuild the token layer |
| `/design-system:inventory` | Build or refresh the catalogue site |
| `/design-system:audit [path]` | Measure design system drift in a codebase |
| `/design-system:publish` | Package it for npm — exports, types, versioning, release CI |

## The interview

Two rounds. Options are pre-selected from what is already in your repo, so confirming takes one click.

**Round 1 — stack**
- **Primitives**: Base UI · Radix · React Aria Components · none *(Ark UI, Headless UI via Other)*
- **Component layer**: shadcn-style (own the code) · pure primitives · MUI · Mantine *(Chakra, HeroUI, Ant, Park, Radix Themes via Other)*
- **CSS system**: Tailwind v4 · CSS Modules · StyleX · vanilla-extract *(Panda, UnoCSS, Emotion via Other)*
- **Motion**: Motion (`motion/react`) · GSAP · CSS-only · both

**Round 2 — design + delivery**
- **Colour**: one brand hex → generated OKLCH ramp · neutral+accent preset · extracted from the existing product · multi-brand
- **Typography**: system stack · UI sans · display serif + body sans · licensed fonts
- **Distribution**: in-repo · workspace package · private npm · public npm
- **Scope**: everything · foundations first · fit into an existing system · docs only

## What gets built

**Design tokens** — DTCG JSON (W3C format module, stable 2025.10) in three tiers — including opacity and border-width scales — with light/dark themes, and a dependency-free build that emits CSS custom properties, TypeScript types, a flat JSON map, and whichever CSS-system artifact you need: a Tailwind v4 `@theme inline` block, a vanilla-extract contract, StyleX `defineVars`, or a Panda preset. Density (`density.compact.tokens.json` → a `[data-density="compact"]` block) and brand overrides (→ `[data-brand]` blocks) come out of the same build, so a compact mode or a second brand is a token file, not a fork.

Colour ramps are built in **OKLCH** because HSL's lightness is not perceptual — an HSL ramp gives evenly-spaced steps in some hues and badly bunched ones in others. The shipped ramps are tuned by measurement: `oklch(0.565 0.185 258)` clears 4.5:1 against white at **4.66:1**, and the same hue at `L 0.600` lands at 4.03:1 and fails.

**The contrast gate** — every foreground/background pair, in every theme, checked at build time. A failing pair fails the build with the measured ratio and the required one. Contrast as a CI gate rather than a review comment is the highest-leverage accessibility decision available: it makes the failure impossible to merge rather than easy to miss.

**Components** — built on your primitive layer with a consistent API grammar: controlled *and* uncontrolled, compound parts where arrangement varies, one polymorphism convention, deliberate escape hatches, and invariants encoded in the type system (an icon-only `Button` without `aria-label` does not compile). Init builds wave 1 — `Button`, `TextField`, `Dialog`, a source-agnostic `Icon`, and the layout primitives `Box`/`Stack`/`Inline` with token-gated style props — and the road to a complete v1 is written down as a **component roadmap** in three waves, with what each component exercises and which are primitive-backed versus genuinely custom.

**The inventory site** — a catalogue in the spirit of Atlassian, Polaris and Geist: live examples, auto-extracted props tables, keyboard maps, do/don't pairs, tokens consumed, adoption counts, and **measured** test/a11y/lint status. Plus a foundations page with real contrast numbers, a token explorer with theme and density switching, a status board, and authored **Patterns** and **Content** starter pages (forms, empty states, errors, loading; voice, action labels, terminology) — the one deliberately hand-edited part of the site, because cross-component judgement has no code to be generated from. Styled entirely with the system's own tokens, so a token that does not work fails here before it reaches a product. When init's verification passes, the site opens in your browser.

**Tests** — the behavioural contract suite: keyboard maps, focus in-and-out, controlled/uncontrolled parity, ref forwarding, `className` merging, `...rest` spreading, axe per variant. Behaviour, never implementation. Plus **visual regression out of the box** — a Playwright suite that screenshots the inventory site, so every component's visual baseline comes free with its docs page instead of needing a second story-authoring pass.

**Lint** — four custom ESLint rules (`no-raw-color`, `no-hardcoded-dimension`, `no-primitive-token`, `no-deep-import`) that read the generated token file, so they cannot disagree with the tokens. Each message names the replacement. Plus `jsx-a11y` strict with component mapping, and Stylelint for the CSS side.

**The AI surface** — `AGENTS.md` and `llms.txt`, both generated from the registry, so coding agents get the same source of truth the docs render. This is the cheapest quality win in the system: without it, agents invent component names and hardcode hex values. For agents that speak MCP, a dependency-free server (`npm run mcp`) exposes the registry live: `search_components`, `get_component`, `search_tokens`, `get_guidelines`.

**Governance + change management** — a `CONTRIBUTING.md` with the draft → stable gate, an RFC template, a CODEOWNERS example, and a jscodeshift codemod runner (`npm run codemod`) so the first breaking change ships with a migration instead of a changelog apology.

## Skills

Loaded automatically when relevant; also invocable by name.

| Skill | Covers |
|---|---|
| `design-system-architect` | The interview, the brief, the build order, what makes systems get adopted |
| `design-tokens` | Three tiers, DTCG authoring, naming, theming, the contrast gate |
| `primitive-libraries` | Base UI / Radix / React Aria — composition APIs, `data-*` state, wrapping rules |
| `css-systems` | Tailwind v4, CSS Modules, StyleX, vanilla-extract, Panda — how tokens reach components |
| `component-api-design` | Props, variants, controlled/uncontrolled, compound components, escape hatches |
| `motion-system` | Motion vs GSAP vs CSS, motion tokens, reduced motion, performance |
| `icon-system` | Choosing the icon library (Lucide default), the Icon wrapper, sizing, icon a11y, bundle rules |
| `component-inventory` | The registry, the catalogue site, the AI contract |
| `component-testing` | Vitest + RTL, axe, Storybook play functions, visual regression |
| `design-system-linting` | Token enforcement, import boundaries, rolling it out without a revolt |
| `packaging-distribution` | exports maps, `sideEffects`, RSC, changesets, publint/attw |

## Agents

- **`ds-component-author`** — builds one component end to end, matching the conventions already in the repo. Useful in parallel across several components.
- **`ds-accessibility-auditor`** — audits the 60% of accessibility that axe cannot reach: keyboard paths, focus restoration, naming quality, announcements.

## Templates

`templates/` ships the tested versions rather than files written from memory: the token build and its DTCG sources, the registry builder, a reference `Button` in both Tailwind/CVA and CSS Modules form, a source-agnostic `Icon`, the contract test suite and the Playwright VRT suite, the ESLint plugin, the inventory app, the registry MCP server, the codemod runner, governance scaffolds, and packaging + CI config.

The two build scripts are dependency-free Node — they run in CI, in a pre-commit hook, and on a designer's machine that has never run `npm install`.

## Scope

React only, deliberately. The token layer is framework-agnostic (it emits CSS custom properties), so a Vue or Svelte layer can be added later without redoing the foundations.
