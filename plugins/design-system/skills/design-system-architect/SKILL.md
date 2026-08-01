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

# brand assets — the colour question is answerable from these, so find them first
ls -d brand branding assets/brand public/brand design static/brand 2>/dev/null
find . -iname '*logo*' -o -iname '*brand*' | grep -v node_modules | head -10
```

Also look at what the product already looks like — read a couple of the busiest components. You are usually not on a greenfield; you are formalising something that half-exists. Name what you found in the interview ("you're already on Radix + Tailwind, so I've pre-selected those").

**Existing system?** If `design-system.config.json` already exists, this is not an init — read it, tell the user what is already configured, and ask what they want to change. Do not silently re-scaffold over someone's work.

## Step 2 — The interview

Three rounds of `AskUserQuestion`, and **nothing collected outside them**. Pre-select the recommended option as the **first** option with `(Recommended)` in the label, and make the recommendation follow from the survey.

**Every answer goes through `AskUserQuestion` — never ask the user to type a setting as prose.** A brand hex or a system name feels like free text, but `AskUserQuestion` already handles that: it always offers **Other**, which takes custom input. So a free-text question becomes a question with four good defaults *plus* the escape hatch, which is strictly better than a bare prompt — the user who has a brand hex types it into Other, and the user who does not gets four that work. A prose question also loses the structured answer: it arrives as conversation, not as a value you can write into the brief.

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
| 1 | `Colour` | Where does the colour system come from? | **Brand assets I extract** — a folder of logos/stylesheets, or a live URL; I pull the palette out and show you what I found · **One brand hex → generated ramp** — I build a perceptual OKLCH scale around it · **Neutral + accent preset** — a tuned default, pick the accent later · **Multi-brand** — 2+ themes sharing one semantic layer *(extract-from-product-code and "here is my full palette" go via Other)* |
| 2 | `Typography` | What is the type system? | **System stack** — zero network cost, native feel · **UI sans (Inter / Geist / similar)** — the neutral product default · **Display serif + body sans** — editorial contrast · **Licensed/custom fonts** — user provides the files |
| 3 | `Distribution` | Where does the design system live? | **In-repo** (`src/design-system/`) — no version boundary, fastest iteration · **Workspace package** — monorepo, consumed by sibling apps · **Private npm package** — internal registry, versioned · **Public npm package** — published, changesets + release CI |
| 4 | `Scope` | What should I build now? | **Everything** — tokens, components, inventory, tests, lint, CI · **Foundations first** — tokens + theming + 3 reference components · **Add to existing system** — fit into what is already here · **Docs + inventory only** — the system exists, it just isn't documented |

**Do not assume the user can recite their brand colour.** Most people cannot — the brand
exists as a logo, a stylesheet, a live site or a PDF, and the hex lives in one of those.
Make **Brand assets I extract** the recommendation whenever the survey found anything
brand-shaped (a `brand/` folder, a `*logo*` file, a deployed URL in the README), and reserve
the bare-hex option for the case where they clearly already know the value. Asking for a hex
that the user has to go and look up is a question you could have answered yourself.

### Round 3 — the specifics (ask only what rounds 1–2 left open)

Rounds 1 and 2 settle the shape of the system; this round settles the three or four values
that go straight into the brief. **Include a question only if the earlier answers left it
open** — a round of two questions is correct when that is all that is genuinely unknown.

| # | Header | Question | Options (first = recommended) | Ask when |
|---|--------|----------|-------------------------------|----------|
| 1 | *colour input* | see the table below | see the table below | the colour answer left it open |
| 2 | `Icons` | Which icon pack? | **Lucide** — 24px grid, per-icon imports, tree-shakeable, what the surrounding ecosystem assumes · **Phosphor** — six weights from one set · **Heroicons** — outline/solid pair, Tailwind Labs · **Custom brand set** — you provide the SVGs and I build the pipeline | always |
| 3 | `Name` | What is this system called? | Three candidates derived from the repo — `<dir>-ui`, `@<scope>/ui`, `<Product> Design System` — plus Other | always |
| 4 | `Theme` | Which theme is the system authored against first? | **Light-first, dark generated** — the common product default · **Dark-first** — author the dark ramp and derive light · **Follow the OS, no default** · **Light only** — add dark later | always |

Question 1 depends on the colour answer, because "where is your brand" has more than one
right shape:

| Round 2 colour answer | Round 3 question 1 |
|---|---|
| **Brand assets I extract** | `Brand source` — options are the **real paths the survey found** (`./brand`, `./public`, a `*logo*` file), plus *"a live website — paste the URL in Other"* and *"somewhere else — path in Other"*. Never offer a path the survey did not actually find; a made-up option that fails on selection is worse than no option. |
| **One brand hex** | `Brand hex` — the four verified hexes below, with Other for the real one |
| **Multi-brand** | `Brand source` for brand 1, and say plainly that brand 2 arrives as a token file after wave 1 rather than another interview round |
| **Neutral + accent preset** | omit — nothing is open |

**The brand-hex options must be hexes that clear the contrast gate as generated**, so the
first build is green without a re-point. Verified against `generate-ramps.mjs` +
`build.mjs`: `#2563EB` (blue), `#7C3AED` (violet), `#E11D48` (rose) and `#EA580C` (orange)
pass; teal `#0D9488`, cyan `#0891B2` and green `#16A34A` are light-peaking and fail until
the semantic re-point. If the user types one of the latter into **Other**, take it — that is
their brand, not a mistake — and tell them the generator's finding moved `bg.accent` one step
darker. Never silently substitute a different colour.

### Extracting from brand assets

Run the tested script, not your own reading of the files:

```bash
node tokens/extract-brand.mjs --dir ./brand        # a folder of assets
node tokens/extract-brand.mjs --url https://…      # a live site, incl. its linked stylesheets
node tokens/extract-brand.mjs --file logo.svg --json
```

It reads every colour literal out of `.svg`, `.css`, `.html`, `.json`, `.md` and code files,
clusters them in OKLab so `#7C3AED`, `rgb(124,58,238)` and `#7b39ec` collapse into one
candidate, separates neutrals from chromatic candidates, and prints the white-text contrast
each would have as a solid fill — the same measure the build's contrast gate applies, so a
light-peaking accent is visible *before* you generate a ramp from it.

**It does not decode raster images or PDFs**, and it lists what it skipped rather than
dropping it silently. When a logo exists only as `.png`, or the brand guidelines only as
`.pdf`, **read the file yourself** — the Read tool renders images and PDFs — and fold the
colours you see into the candidate list. Say which candidates came from the script and which
from looking; measured and eyeballed are not the same evidence.

Then **confirm with a question, never a guess**: an `AskUserQuestion` whose options are the
top extracted candidates, each labelled with its hex and what it was found in ("`#7C3AED` —
×7 across logo.svg and brand.css"), so the user picks the accent rather than accepting your
ranking. Frequency is a good heuristic and a bad decision-maker: the most common colour in a
stylesheet is often a border grey, and the brand colour of a site with a dark theme is
routinely the second or third hit.

Record the answers as `tokens.source` + the resolved hex, `stack.icons`, `name`/`displayName`,
and `tokens.defaultTheme`/`darkTheme`. The `icon-system` skill owns the full icon menu and its
trade-offs; do not re-derive them here.

**Never skip the interview because you think you know.** Even when `$ARGUMENTS` names the whole stack, run round 1 with those choices pre-selected — confirming takes one click and catches the case where the user was describing what they have, not what they want.

## Step 3 — Resolve the stack

The four stack answers are not independent, and the interview cannot make them so — read `references/stack-constraints.md` and apply it before writing anything. The mechanics:

1. **Component layer first** — it carries every hard coupling. HeroUI *requires* Tailwind v4 (npm-enforced peer dep) and *is* React Aria Components underneath, so one answer settles three questions. MUI, Mantine and antd bring their own styling engines and behaviour layers, which makes the primitives and CSS-system answers moot for their components. Chakra v3 embeds Ark. shadcn's `--base` flag must equal the primitives answer.
2. **When a choice implies or overrides another answer, tell the user what was resolved and why — one sentence per resolution, not a new interview.** "You picked HeroUI, which is built on React Aria Components and requires Tailwind v4, so I've set primitives and the CSS system to match." Then continue. The exception: if the overridden answer was clearly the one the user cared about (they chose vanilla-extract for compile-time theme contracts, then added HeroUI as an afterthought), surface the conflict as a real question — which one goes?
3. **Record the outcome.** The resolved values go into `stack.*`, `stack.resolved: true` marks that this pass ran, and every resolved-rather-than-chosen decision gets a `rationale` entry saying it was implied and by what. A config that silently records `cssSystem: "tailwind"` next to `componentLayer: "heroui"` reads as two decisions when it was one.

## Step 4 — Write the brief

Write `design-system.config.json` from `${CLAUDE_PLUGIN_ROOT}/templates/config/design-system.config.json`, filled with the answers. Show it to the user. This file is the contract — every other command in this plugin reads it, and the lint rules and inventory derive from it.

Record the *why*, not just the what: a `rationale` field per decision. Two years from now someone will ask why the team is on vanilla-extract, and the answer should be in the repo.

## Step 5 — Build it, in parallel

**Do not build this inline, and do not build it in the order the steps are written.** The
build order reads as seven serial steps; the real dependency graph is four phases deep, and
its two slowest parts — `npm install` and the token/CSS/motion authoring — have nothing to do
with each other. Run them as written and init takes the sum. Run them as the graph allows and
it takes the slowest path.

Building inline costs twice over: the wall-clock, and a conversation stuffed with every file
the build touched, so the later steps run in a heavy, slow context and the user has to scroll
past a thousand lines of scaffolding to find the thing they wanted to look at.

```
                 ┌─ scaffold + install ────────────────────────────┐
 brief written ──┤                                                 ├─ barrier ─┐
                 └─ tokens ──→ ┌─ css-systems ─┐                   │           │
                               └─ motion ──────┘─── barrier ───────┘           │
                                                                               │
   ┌───────────────────────────────────────────────────────────────────────────┘
   └─ Button ∥ TextField ∥ Dialog ∥ Icon+layout ── barrier ─→ registry (parent, ONCE)
                                                        └─→ lint ∥ inventory ─→ verify
```

`references/build-phases.md` is the contract that makes this safe: the phase graph, a
file-ownership table per agent, and the four races ownership prevents. **Read it before
dispatching anything** — concurrency here is safe *because* of the ownership rules, not
despite them. The load-bearing ones: only one agent ever installs, only one agent writes
build config, nobody but the parent builds the registry, and no agent runs a whole-project
verification sweep.

### How to run it

**Preferred — the shipped workflow.** If the `Workflow` tool is available, run
`${CLAUDE_PLUGIN_ROOT}/templates/workflows/build-design-system.mjs`, passing the plugin root
(as an absolute path — `${CLAUDE_PLUGIN_ROOT}` does not expand inside a workflow script), the
DS root and the parsed brief:

```
Workflow({ scriptPath: '<plugin root>/templates/workflows/build-design-system.mjs',
           args: { pluginRoot: '<abs>', dsRoot: '.', brief: <the config you just wrote> } })
```

It encodes the graph above as deterministic phases, keeps every agent's file output out of
this conversation, and returns a structured report of what was built, what failed and what
needs a decision. It runs in the background; you get a notification when it completes.

**Fallback — parallel subagent dispatch.** Same graph, same ownership rules, one message per
phase with several `Agent` calls in it. Agents dispatched in separate messages run serially
and you have bought nothing. `build-phases.md` ends with the exact dispatch sequence.

### The wave-1 components, and why these four

- `Button` — variants, sizes, states, icon slots
- `TextField` — label/description/error, controlled + uncontrolled, form integration
- `Dialog` — portal, focus trap, scroll lock, animation
- `Icon` + the layout primitives `Box`, `Stack`, `Inline` — one agent for all four, because they share a property: no state, no ARIA of their own, nothing to wrap. Icon starts from `${CLAUDE_PLUGIN_ROOT}/templates/components/Icon/Icon.tsx` (the `icon-system` skill owns the library decision); the layout primitives take token-gated style props only, and the roadmap explains why they belong in wave 1 — they are what stops product teams hand-rolling flex divs on day one.

Button, TextField and Dialog exercise every hard problem in the system — polymorphism, forms,
portals, focus, motion. Get them right and the rest are variations. Get them wrong and you
rewrite fifty components. The full v1 build order beyond this wave is
`references/component-roadmap.md` — read it before promising anyone a component list.

**Init stops after wave 1.** Everything later multiplies whatever the wave-1 grammar got
right or wrong, so the user must see three real components in their own colours before fifty
more are built on the same assumptions. The inventory site opening in their browser at the
end of Step 6 *is* that gate — it is a far better one than a wall of text, because it is the
fastest way for them to spot the thing they want changed. Offer wave 2 there; build it in
`/design-system:component`, not here.

The phases in order, each a skill to invoke rather than improvise: `design-tokens` →
`css-systems` ∥ `motion-system` → four `ds-component-author` subagents → the parent's single
registry build → `design-system-linting` ∥ `component-inventory` → `packaging-distribution`
(only if the brief says package).

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
