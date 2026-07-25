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

**Design tokens** — DTCG JSON (W3C format module, stable 2025.10) in three tiers, light/dark and multi-brand themes, and a dependency-free build that emits CSS custom properties, TypeScript types, a flat JSON map, and whichever CSS-system artifact you need: a Tailwind v4 `@theme inline` block, a vanilla-extract contract, StyleX `defineVars`, or a Panda preset.

Colour ramps are built in **OKLCH** because HSL's lightness is not perceptual — an HSL ramp gives evenly-spaced steps in some hues and badly bunched ones in others. The shipped ramps are tuned by measurement: `oklch(0.565 0.185 258)` clears 4.5:1 against white at **4.66:1**, and the same hue at `L 0.600` lands at 4.03:1 and fails.

**The contrast gate** — every foreground/background pair, in every theme, checked at build time. A failing pair fails the build with the measured ratio and the required one. Contrast as a CI gate rather than a review comment is the highest-leverage accessibility decision available: it makes the failure impossible to merge rather than easy to miss.

**Components** — built on your primitive layer with a consistent API grammar: controlled *and* uncontrolled, compound parts where arrangement varies, one polymorphism convention, deliberate escape hatches, and invariants encoded in the type system (an icon-only `Button` without `aria-label` does not compile).

**The inventory site** — a catalogue in the spirit of Atlassian, Polaris and Geist: live examples, auto-extracted props tables, keyboard maps, do/don't pairs, tokens consumed, adoption counts, and **measured** test/a11y/lint status. Plus a foundations page with real contrast numbers, a token explorer with theme and density switching, and a status board. Styled entirely with the system's own tokens, so a token that does not work fails here before it reaches a product.

**Tests** — the behavioural contract suite: keyboard maps, focus in-and-out, controlled/uncontrolled parity, ref forwarding, `className` merging, `...rest` spreading, axe per variant. Behaviour, never implementation.

**Lint** — four custom ESLint rules (`no-raw-color`, `no-hardcoded-dimension`, `no-primitive-token`, `no-deep-import`) that read the generated token file, so they cannot disagree with the tokens. Each message names the replacement. Plus `jsx-a11y` strict with component mapping, and Stylelint for the CSS side.

**`AGENTS.md`** — generated from the registry, so coding agents get the same source of truth the docs render. This is the cheapest quality win in the system: without it, agents invent component names and hardcode hex values.

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
| `component-inventory` | The registry, the catalogue site, the AI contract |
| `component-testing` | Vitest + RTL, axe, Storybook play functions, visual regression |
| `design-system-linting` | Token enforcement, import boundaries, rolling it out without a revolt |
| `packaging-distribution` | exports maps, `sideEffects`, RSC, changesets, publint/attw |

## Agents

- **`ds-component-author`** — builds one component end to end, matching the conventions already in the repo. Useful in parallel across several components.
- **`ds-accessibility-auditor`** — audits the 60% of accessibility that axe cannot reach: keyboard paths, focus restoration, naming quality, announcements.

## Templates

`templates/` ships the tested versions rather than files written from memory: the token build and its DTCG sources, the registry builder, a reference `Button` in both Tailwind/CVA and CSS Modules form, the contract test suite, the ESLint plugin, the inventory app, and packaging + CI config.

The two build scripts are dependency-free Node — they run in CI, in a pre-commit hook, and on a designer's machine that has never run `npm install`.

## Scope

React only, deliberately. The token layer is framework-agnostic (it emits CSS custom properties), so a Vue or Svelte layer can be added later without redoing the foundations.
