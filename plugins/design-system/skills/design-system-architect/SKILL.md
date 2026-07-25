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

Do this before the first question. Every fact you find here is a question you do not have to ask, and a wrong assumption you do not get to make.

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

Adjust the recommendation to the survey: an existing Radix codebase makes Radix the recommendation, not Base UI. A marketing-heavy or scroll-choreographed product makes GSAP the recommendation. Say the *why* in the option description — the user is picking a five-year commitment.

### Round 2 — design + delivery (4 questions)

| # | Header | Question | Options |
|---|--------|----------|---------|
| 1 | `Colour` | Where does the colour system come from? | **One brand hex → generated ramp** — I build a perceptual OKLCH scale around it · **Neutral + accent preset** — a tuned default, pick the accent later · **Extract from the existing product** — I read the current CSS and rationalise it · **Multi-brand** — 2+ themes sharing one semantic layer |
| 2 | `Typography` | What is the type system? | **System stack** — zero network cost, native feel · **UI sans (Inter / Geist / similar)** — the neutral product default · **Display serif + body sans** — editorial contrast · **Licensed/custom fonts** — user provides the files |
| 3 | `Distribution` | Where does the design system live? | **In-repo** (`src/design-system/`) — no version boundary, fastest iteration · **Workspace package** — monorepo, consumed by sibling apps · **Private npm package** — internal registry, versioned · **Public npm package** — published, changesets + release CI |
| 4 | `Scope` | What should I build now? | **Everything** — tokens, components, inventory, tests, lint, CI · **Foundations first** — tokens + theming + 3 reference components · **Add to existing system** — fit into what is already here · **Docs + inventory only** — the system exists, it just isn't documented |

If the user answers colour with "one brand hex", ask for the hex in plain text after the round — do not burn a question slot on free text.

**Never skip the interview because you think you know.** Even when `$ARGUMENTS` names the whole stack, run round 1 with those choices pre-selected — confirming takes one click and catches the case where the user was describing what they have, not what they want.

## Step 3 — Write the brief

Write `design-system.config.json` from `${CLAUDE_PLUGIN_ROOT}/templates/config/design-system.config.json`, filled with the answers. Show it to the user. This file is the contract — every other command in this plugin reads it, and the lint rules and inventory derive from it.

Record the *why*, not just the what: a `rationale` field per decision. Two years from now someone will ask why the team is on vanilla-extract, and the answer should be in the repo.

## Step 4 — Build order

Each step is a skill. Invoke it; don't improvise from memory. **The order matters** — every step consumes the previous one's output.

1. **`design-tokens`** — DTCG sources, three tiers, light/dark, the build script, the contrast gate. Nothing can be styled until this exists.
2. **`css-systems`** — wire the token output into the chosen CSS system so `color.bg.accent` is reachable the idiomatic way (a Tailwind `@theme` block, a vanilla-extract contract, a StyleX `defineVars`, a Panda preset, a CSS var sheet).
3. **`primitive-libraries`** + **`component-api-design`** — install the primitive layer and build the reference components. Build **exactly three first**: `Button` (variants, sizes, states, icon slots), `TextField` (label/description/error, controlled + uncontrolled, form integration), `Dialog` (portal, focus trap, scroll lock, animation). Those three exercise every hard problem in the system — polymorphism, forms, portals, focus, motion. Get them right and the rest are variations. Get them wrong and you rewrite fifty components.
4. **`motion-system`** — motion tokens, the reduced-motion strategy, the animation primitives the components share.
5. **`component-testing`** — the behavioural contract suite. Write it against the three reference components so every later component inherits the pattern.
6. **`design-system-linting`** — the enforcement layer: token rules, a11y rules, import boundaries.
7. **`component-inventory`** — the registry generator, then the site that reads it, then `AGENTS.md` (also generated from the registry).
8. **`packaging-distribution`** — only if the brief says package.

Stop and show the user after step 3. Three real components in their colours is the moment they can tell you it's wrong — and it is much cheaper to hear that then than after fifty.

## Step 5 — Verify, then report

Run these and paste real output. A design system that does not build is worse than none, because people will work around it and never come back.

```bash
npm run tokens        # token build + contrast gate
npx tsc --noEmit      # types
npm test              # behaviour + a11y
npm run lint          # including the DS rules
npm run inventory:build
```

If a step fails, fix it. Do not report a green build you did not see, and do not describe a step you skipped as done — say which parts are complete and which are not.

## What separates a design system that gets adopted

Adoption is the only success metric; a beautiful unadopted library is a failed project. The failure modes are boringly consistent:

- **It's easier to hand-roll than to use.** If importing a `Button` takes more thought than writing `<button className="...">`, people write the div. Keep the API tiny and the import path obvious.
- **It can't express the one-off.** Every real product needs an escape hatch. Give one deliberately (`className` passthrough, a `render`/`asChild` prop, exposed CSS vars) or people will fork the component and you lose them permanently.
- **The docs lie.** One props table that is wrong poisons trust in all of them. This is why the registry is generated — a generated table cannot drift.
- **It's a black box.** Publish the tokens, the source, and the reasoning. A designer who can read the spacing scale will use it.
- **Nobody owns it.** Write down in the README who reviews additions and how a component graduates draft → stable. A system with no gate becomes a junk drawer within a year.
