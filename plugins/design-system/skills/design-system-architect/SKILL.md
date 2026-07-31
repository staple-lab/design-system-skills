---
name: design-system-architect
description: Use when creating, planning, or restructuring a design system or component library for React - runs the stack interview (primitive layer, component layer, CSS system, colour, typography, motion, distribution), writes the machine-readable brief, and drives the build order for tokens, components, inventory site, tests, lint and packaging. Triggers on "build a design system", "component library", "design tokens setup", "standardise our UI".
---

# Design system architect

You are standing up a design system that must serve **two consumers at once**: the humans who read the docs, and the AI agents that write code against it. Those consumers want the same thing — an unambiguous, machine-readable statement of what exists, what it is called, and what it is allowed to do. Build for that and the docs come free.

## The one architectural idea

```
      design-system.config.json      ← the brief (what we chose, and why)
      tokens/*.tokens.json (DTCG)    ← the values
      src/**/*.tsx + TS types        ← the components
                    │
                    ▼  generated, never hand-written
            .design-system/registry.json
                    │
      ┌─────────────┼──────────────┬───────────────┐
      ▼             ▼              ▼               ▼
  inventory     AGENTS.md       lint rules      test matrix
    site      (AI contract)   (enforcement)   (behaviour)
```

**One source, four consumers.** Docs drift from code because they are written twice. Write them once, generate the rest. When you are tempted to put a fact only in the docs site, put it in the registry and let the site read it.

## Step 1 — Survey before you ask

Do this before the first question. Every fact you find here is a question you do not have to ask, and a wrong assumption you do not get to make. Run the probes as **one batched shell call**, not five round-trips — none depends on another's output.

```bash
cat package.json                      # react version, package manager, workspaces, existing deps
ls -d src/components src/ui packages/* 2>/dev/null
rg -l "tailwind|@radix-ui|@base-ui|react-aria|styled-components|@emotion|\.module\.css|@stylexjs|@pandacss|@vanilla-extract" --glob '!node_modules' | head -30
ls tailwind.config.* postcss.config.* panda.config.* 2>/dev/null
rg -c "className=" --glob '*.tsx' | wc -l    # rough size of the surface being standardised
```

Also look at what the product already looks like — read a couple of the busiest components. You are usually not on a greenfield; you are formalising something that half-exists. Name what you found in the interview ("you're already on Radix + Tailwind, so I've pre-selected those").

**Existing system?** If `design-system.config.json` already exists, this is not an init — read it, tell the user what is already configured, and ask what they want to change. Do not silently re-scaffold over someone's work.

## Step 2 — The interview

Two rounds of `AskUserQuestion`. Not three, not seven. Pre-select the recommended option as the **first** option with `(Recommended)` in the label, and make the recommendation follow from the survey.

Read `references/stack-menu.md` for the full menu behind each question — the four options are the common answers, and "Other" needs you to know the rest.

### Round 1 — the stack (4 questions, single-select)

| # | Header | Question | Options (first = recommended default) |
|---|--------|----------|----------------------------------------|
| 1 | `Primitives` | Which headless primitive layer should the components be built on? | **Base UI** — MUI's headless lib, stable 1.x, `@base-ui/react`, the current default for new systems · **Radix Primitives** — largest ecosystem, most examples, `asChild` composition · **React Aria Components** — Adobe; the strongest a11y and i18n story, best for enterprise/regulated · **None** — build primitives in-house |
| 2 | `Components` | Do you want a component layer on top, or pure primitives? | **shadcn-style (own the code)** — generated into your repo, you own and restyle it · **Pure primitives** — maximum control, most work · **MUI** — batteries-included, heavy theming API · **Mantine** — batteries-included, lighter, hooks-rich |
| 3 | `CSS system` | How should components be styled? | **Tailwind v4** — CSS-first `@theme`, tokens are CSS vars by default · **CSS Modules** — plain CSS, zero build magic, RSC-safe · **StyleX** — Meta's build-time atomic CSS, typed, strict · **vanilla-extract** — typed `.css.ts`, compile-time token contracts |
| 4 | `Motion` | What drives animation? | **Motion (`motion/react`)** — React-first, ~5kb mini bundle, best for UI · **GSAP** — timeline + ScrollTrigger, best when motion is the brand · **CSS-only** — transitions + `@keyframes` from motion tokens, zero JS · **Motion + GSAP** — Motion for UI, GSAP for scroll set-pieces |

Adjust the recommendation to the survey: an existing Radix codebase makes Radix the recommendation, not Base UI. A marketing-heavy or scroll-choreographed product makes GSAP the recommendation. A Tailwind shop that wants velocity over a bespoke look is the cue to surface HeroUI (React Aria + Tailwind v4, see the stack menu) as the component-layer option — note in the option description that it locks the CSS-system answer to Tailwind v4 (Step 3 enforces this). Say the *why* in the option description — the user is picking a five-year commitment.

### Round 2 — design + delivery (4 questions)

| # | Header | Question | Options |
|---|--------|----------|---------|
| 1 | `Colour` | Where does the colour system come from? | **One brand hex → generated ramp** — I build a perceptual OKLCH scale around it · **Neutral + accent preset** — a tuned default, pick the accent later · **Extract from the existing product** — I read the current CSS and rationalise it · **Multi-brand** — 2+ themes sharing one semantic layer |
| 2 | `Typography` | What is the type system? | **System stack** — zero network cost, native feel · **UI sans (Inter / Geist / similar)** — the neutral product default · **Display serif + body sans** — editorial contrast · **Licensed/custom fonts** — user provides the files |
| 3 | `Distribution` | Where does the design system live? | **In-repo** (`src/design-system/`) — no version boundary, fastest iteration · **Workspace package** — monorepo, consumed by sibling apps · **Private npm package** — internal registry, versioned · **Public npm package** — published, changesets + release CI |
| 4 | `Scope` | What should I build now? | **Everything** — tokens, components, inventory, tests, lint, CI · **Foundations first** — tokens + theming + 3 reference components · **Add to existing system** — fit into what is already here · **Docs + inventory only** — the system exists, it just isn't documented |

If the user answers colour with "one brand hex", ask for the hex in plain text after the round — do not burn a question slot on free text.

**After Round 2, one plain-text follow-up** (the rounds are full at 4 questions each, so this is not an `AskUserQuestion` slot): *"Which icon pack? Lucide is the default — consistent 24px grid, tree-shakeable, the shadcn ecosystem's choice — but if you have a brand icon set or another preference, name it."* Default to Lucide on a shrug. The `icon-system` skill owns the full menu and the trade-offs; do not re-derive them here. Record the answer as `stack.icons`.

**Never skip the interview because you think you know.** Even when `$ARGUMENTS` names the whole stack, run round 1 with those choices pre-selected — confirming takes one click and catches the case where the user was describing what they have, not what they want.

## Step 3 — Resolve the stack

The four stack answers are not independent, and the interview cannot make them so — read `references/stack-constraints.md` and apply it before writing anything. The mechanics:

1. **Component layer first** — it carries every hard coupling. HeroUI *requires* Tailwind v4 (npm-enforced peer dep) and *is* React Aria Components underneath, so one answer settles three questions. MUI, Mantine and antd bring their own styling engines and behaviour layers, which makes the primitives and CSS-system answers moot for their components. Chakra v3 embeds Ark. shadcn's `--base` flag must equal the primitives answer.
2. **When a choice implies or overrides another answer, tell the user what was resolved and why — one sentence per resolution, not a new interview.** "You picked HeroUI, which is built on React Aria Components and requires Tailwind v4, so I've set primitives and the CSS system to match." Then continue. The exception: if the overridden answer was clearly the one the user cared about (they chose vanilla-extract for compile-time theme contracts, then added HeroUI as an afterthought), surface the conflict as a real question — which one goes?
3. **Record the outcome.** The resolved values go into `stack.*`, `stack.resolved: true` marks that this pass ran, and every resolved-rather-than-chosen decision gets a `rationale` entry saying it was implied and by what. A config that silently records `cssSystem: "tailwind"` next to `componentLayer: "heroui"` reads as two decisions when it was one.

## Step 4 — Write the brief

Write `design-system.config.json` from `${CLAUDE_PLUGIN_ROOT}/templates/config/design-system.config.json`, filled with the answers. Show it to the user. This file is the contract — every other command in this plugin reads it, and the lint rules and inventory derive from it.

Record the *why*, not just the what: a `rationale` field per decision. Two years from now someone will ask why the team is on vanilla-extract, and the answer should be in the repo.

## Step 5 — Build order

Each step is a skill. Invoke it; don't improvise from memory. The spine is serial — every step consumes the previous one's output — but the widest step, the reference components, **fans out to parallel subagents**. Built inline and one after another, the three components dominate init wall-clock *and* fill the conversation with every file they touch, so the later steps run in a heavy, slow context. Subagents fix both.

**Serial spine — each step feeds the next:**

1. **`design-tokens`** — DTCG sources, three tiers, light/dark, the build script, the contrast gate. Nothing can be styled until this exists. The colour answer runs its tested script, never hand-computed values: brand hex → `${CLAUDE_PLUGIN_ROOT}/templates/tokens/generate-ramps.mjs` (the hex lands verbatim at its step; a light-peaking hue gets a measured finding naming the semantic re-point), vendor palette → `import-palette.mjs`, extract-from-product → the `adopt/infer-tokens.mjs` flow.
2. **`css-systems`** — wire the token output into the chosen CSS system so `color.bg.accent` is reachable the idiomatic way (a Tailwind `@theme` block, a vanilla-extract contract, a StyleX `defineVars`, a Panda preset, a CSS var sheet).
3. **`motion-system`** — motion tokens, the reduced-motion strategy, the shared animation primitives. This runs *before* the components deliberately: `Dialog` animates on day one, so the motion tokens and reduced-motion pattern must already exist for its author to consume.
4. **Install the primitive layer and scaffold the shared harness** — install the chosen primitive package, copy the test harness (`${CLAUDE_PLUGIN_ROOT}/templates/testing/vitest.config.ts`, `vitest.setup.ts`) and the lint configs once, now, so the parallel authors below never race to create them. Copy the governance scaffolds in the same pass — `${CLAUDE_PLUGIN_ROOT}/templates/governance/` ships `CONTRIBUTING.md` (the draft→stable gate), an RFC template and a `CODEOWNERS.example` — because "nobody owns it" is a failure mode you prevent at scaffold time, not one you retrofit. Copy the codemod runner too (`${CLAUDE_PLUGIN_ROOT}/templates/codemods/`, wired as `npm run codemod`): it earns nothing today and everything at the first breaking change.

**Fan out — four `ds-component-author` subagents, dispatched in a single message** (the full v1 build order beyond this wave is `references/component-roadmap.md` — read it before promising anyone a component list):

- `Button` — variants, sizes, states, icon slots
- `TextField` — label/description/error, controlled + uncontrolled, form integration
- `Dialog` — portal, focus trap, scroll lock, animation
- `Icon` + the layout primitives `Box`, `Stack`, `Inline` — one agent for all four, because they share a property: no state, no ARIA of their own, nothing to wrap. Icon starts from `${CLAUDE_PLUGIN_ROOT}/templates/components/Icon/Icon.tsx` (the `icon-system` skill owns the library decision); the layout primitives take token-gated style props only, and the roadmap explains why they belong in wave 1 — they are what stops product teams hand-rolling flex divs on day one.

Button, TextField and Dialog exercise every hard problem in the system — polymorphism, forms, portals, focus, motion. Get them right and the rest are variations. Get them wrong and you rewrite fifty components. All four dispatches are **independent of each other** once tokens, CSS wiring and motion exist — each writes only its own directories, contract tests and `.meta.json` — so build them concurrently. Tell each agent explicitly: the harness and configs already exist; consult `component-api-design`, `primitive-libraries`, `css-systems` and `component-testing` as it works; and **do not regenerate the registry** — concurrent regens race on writing `registry.json`. When all four return, the parent runs the registry build once.

Stop and show the user here. Three real components in their colours is the moment they can tell you it's wrong — and it is much cheaper to hear that then than after fifty.

**Serial tail:**

5. **`design-system-linting`** — the enforcement layer: token rules, a11y rules, import boundaries.
6. **`component-inventory`** — the registry generator, then the site that reads it (including the authored Patterns and Content starter pages), then the AI surface: `AGENTS.md` and `llms.txt`, both generated from the registry, plus the registry MCP server (`${CLAUDE_PLUGIN_ROOT}/templates/mcp/server.mjs`, wired as `npm run mcp`). Wire visual regression here too — `${CLAUDE_PLUGIN_ROOT}/templates/testing/playwright.config.ts` and `${CLAUDE_PLUGIN_ROOT}/templates/testing/vrt/inventory.vrt.spec.ts` screenshot the inventory site itself, so every component's visual baseline comes free with its docs page. Independent of step 5 (lint reads the generated token file, inventory reads the registry) — run them in either order, or as two parallel subagents if the components came back clean.
7. **`packaging-distribution`** — only if the brief says package.

## Step 6 — Verify, then report

Run these and paste real output. A design system that does not build is worse than none, because people will work around it and never come back.

```bash
npm run tokens        # first, alone — everything else reads its output (it takes well under a second)
```

Then the remaining four **in parallel — one message, four tool calls**. They are independent read-only checks; run serially they cost the sum of a typecheck, a test run, a lint pass and a Vite build, run together they cost the slowest one:

```bash
npx tsc --noEmit      # types
npm test              # behaviour + a11y
npm run lint          # including the DS rules
npm run inventory:build
```

If a step fails, fix it. Do not report a green build you did not see, and do not describe a step you skipped as done — say which parts are complete and which are not.

**When everything is green, show it, don't describe it.** Launch the inventory dev server in the background and open it in the user's browser:

```bash
npm run inventory -- --open    # run in the background; Vite opens the browser itself
```

Report the URL Vite prints (typically `http://localhost:5173`). Seeing their own components in their own colours is worth more than any summary you can write — it is also the fastest way for the user to spot the thing they want changed. Skip the auto-open when running headless or in CI; print the URL and move on.

## What separates a design system that gets adopted

Adoption is the only success metric; a beautiful unadopted library is a failed project. The failure modes are boringly consistent:

- **It's easier to hand-roll than to use.** If importing a `Button` takes more thought than writing `<button className="...">`, people write the div. Keep the API tiny and the import path obvious.
- **It can't express the one-off.** Every real product needs an escape hatch. Give one deliberately (`className` passthrough, a `render`/`asChild` prop, exposed CSS vars) or people will fork the component and you lose them permanently.
- **The docs lie.** One props table that is wrong poisons trust in all of them. This is why the registry is generated — a generated table cannot drift.
- **It's a black box.** Publish the tokens, the source, and the reasoning. A designer who can read the spacing scale will use it.
- **Nobody owns it.** Write down in the README who reviews additions and how a component graduates draft → stable. A system with no gate becomes a junk drawer within a year.
