# Build phases — the parallel scaffold

The build order in `SKILL.md` reads as seven serial steps. It is not seven serial steps: the
real dependency graph is **four phases deep**, and the widest parts of it are independent.
This file is the contract that makes running them concurrently safe — the phase graph, who
owns which files, and the four races that ownership prevents.

Both execution paths use it: the shipped workflow script
(`${CLAUDE_PLUGIN_ROOT}/templates/workflows/build-design-system.mjs`) and the fallback
single-message subagent dispatch. They must stay identical in phases and ownership, because
the whole point is that the same contract holds either way.

## Why bother

On a cold repo the serial build is dominated by two things that have nothing to do with each
other: `npm install` (30–90s of network) and the token/CSS/motion authoring (three agents of
reading and writing). Run serially they add up. Run as two chains that rejoin, the install
disappears entirely under the authoring work.

The critical path drops from

```
install → tokens → css → motion → 4 components → registry → lint → inventory
```

to

```
max( install ,  tokens → max(css, motion) ) → 4 components ∥ → registry → max(lint, inventory)
```

Four barriers instead of eight steps, and the two slowest things overlap.

## The graph

```
                 ┌─ A scaffold + install ──────────────────────────┐
 brief written ──┤                                                 ├─ barrier ─┐
                 └─ B tokens ──→ ┌─ C css-systems ─┐               │           │
                                 └─ D motion ──────┘── barrier ────┘           │
                                                                               │
   ┌───────────────────────────────────────────────────────────────────────────┘
   │
   ├─ E Button ─┐
   ├─ F TextField ─┤
   ├─ G Dialog ────┼── barrier ─→ parent: build registry ONCE ─┬─ J lint rules ──┐
   └─ H Icon + Box/Stack/Inline ─┘                             └─ K inventory + AI ─┤
                                                                                    │
                                        parent: verify (5 parallel commands) ←──────┘
```

`A` and `B` start together the moment `design-system.config.json` exists. `C` and `D` start
when `B` finishes — they do **not** wait for `A`, because neither writes code that needs
`node_modules`. Wave 1 waits for both chains: the component authors run tests.

## Ownership

Ownership is **per phase**, not for all time — `eslint.config.mjs` belongs to A in phase 0
and to J in phase 3, which is fine because those never overlap. Within a phase, an agent
writes only what it owns. This is the whole safety mechanism; there is no locking.

| Agent | Owns (writes) | Reads | Must not touch |
|---|---|---|---|
| **A** scaffold | `package.json` (**all** scripts, up front), `package-lock.json`, `node_modules/`, `tsconfig.json`, `vite.config.ts`, `.gitignore`, `vitest.config.ts`, `vitest.setup.ts`, `eslint.config.mjs`, `stylelint.config.mjs`, `tools/eslint-plugin-design-system/`, `scripts/build-registry.mjs`, `mcp/`, `codemods/`, `CONTRIBUTING.md`, `CODEOWNERS`, `rfcs/` | the brief | `tokens/`, `src/design-system/**` |
| **B** tokens | `tokens/**` (sources **and** `tokens/dist/`) | the brief | `package.json` — the `tokens` script is already there |
| **C** css-systems | `src/design-system/styles/**`, the CSS-system's own token bridge | `tokens/dist/` | `vite.config.ts`, `package.json`, `tokens/` |
| **D** motion | `src/design-system/motion/**` | `tokens/dist/` | the global stylesheet (see the import contract below) |
| **E–H** component authors | `<paths.components>/<Name>/**` and nothing else | brief, tokens, styles, motion, siblings' *existing* files | each other, `registry.json`, every shared config |
| **J** lint rules | `eslint.config.mjs`, `stylelint.config.mjs`, `tools/eslint-plugin-design-system/**` | `tokens/dist/tokens.json` | `inventory/`, components |
| **K** inventory + AI | `inventory/**`, `AGENTS.md`, `llms.txt`, `playwright.config.ts`, `tests/vrt/**` | `registry.json`, `tokens/dist/` | lint configs, components |

### The four rules that follow from the table

1. **Only A installs.** No other agent runs `npm install`, `npm add`, `pnpm add` or anything
   that writes the lockfile. Two concurrent installs corrupt `package-lock.json` and the
   failure surfaces much later as a missing module. A reads `stack.*` from the brief and
   installs *everything* the resolved stack needs in one pass — primitive layer, CSS system,
   icon pack, motion library, test and lint toolchain — so C and D never need to.
2. **Only A writes build config.** A owns `vite.config.ts` including whatever plugin the CSS
   system needs (`@tailwindcss/vite`, `@vanilla-extract/vite-plugin`, StyleX's). C writes
   *stylesheets and token bridges*, never build config. This is why C can run before the
   install finishes.
3. **Nobody but the parent builds the registry.** Concurrent `build-registry.mjs` runs race
   on writing `registry.json` and the loser's component silently vanishes from the docs. The
   parent runs it once at the wave-1 barrier.
4. **Agents do not verify the whole project.** A component author runs its own tests; nobody
   runs the full typecheck/lint/build sweep mid-flight, because half the system does not
   exist yet and the red output is noise. Verification is the parent's job, at the end, in
   parallel.

### The one cross-agent contract

C and D both have a claim on "the global stylesheet". Resolve it by declaration rather than
coordination: **C owns the global stylesheet and writes, unconditionally, an import of D's
motion CSS** —

```css
/* src/design-system/styles/global.css — written by C */
@import '../motion/motion.css';
```

— while **D creates that file**, containing the `prefers-reduced-motion` block. Neither waits
for the other; the import resolves at build time, which is after both have finished. If D is
told the motion answer is CSS-only, it still creates the file: an empty-but-present
`motion.css` is what keeps the contract from being conditional.

## Phase detail

### Phase 0 — chain A: scaffold

`npm init` if there is no `package.json`, then the full dependency install for the resolved
stack, then copy the shared harness so the parallel authors below never race to create it:

- `${CLAUDE_PLUGIN_ROOT}/templates/testing/vitest.config.ts` and `vitest.setup.ts`
- `${CLAUDE_PLUGIN_ROOT}/templates/lint/` → a **working baseline** eslint + stylelint config
  (J tunes it later; the point is that `npm run lint` works from phase 0, so component authors
  can run it)
- `${CLAUDE_PLUGIN_ROOT}/templates/governance/` → `CONTRIBUTING.md` (the draft→stable gate),
  `rfcs/0000-template.md`, `CODEOWNERS.example`. "Nobody owns it" is a failure mode you
  prevent at scaffold time, not one you retrofit.
- `${CLAUDE_PLUGIN_ROOT}/templates/codemods/` wired as `npm run codemod` — earns nothing
  today, everything at the first breaking change
- `${CLAUDE_PLUGIN_ROOT}/templates/registry/build-registry.mjs` → `scripts/build-registry.mjs`
- `${CLAUDE_PLUGIN_ROOT}/templates/mcp/server.mjs` → `mcp/server.mjs`

Write **every** script into `package.json` in this one pass, including the ones for tools that
do not exist yet (`tokens`, `registry`, `inventory`, `test:vrt`, `mcp`, `codemod`). The script
block in `${CLAUDE_PLUGIN_ROOT}/templates/package/package.json` is the tested list. A later
agent adding its own script is exactly the write conflict this rule exists to prevent.

### Phase 0 — chain B: tokens

The `design-tokens` skill, then the colour path the brief names — always the tested script,
never hand-computed values:

| `tokens.source` in the brief | Run (from `${CLAUDE_PLUGIN_ROOT}/templates/tokens/`) |
|---|---|
| brand assets / a website | `node tokens/extract-brand.mjs --dir <path>` or `--url <site>`, then feed the **confirmed** hex to `generate-ramps.mjs`. The confirmation happened in the interview — do not re-rank the candidates here. |
| one brand hex | `node tokens/generate-ramps.mjs --accent "<hex>"` — the hex lands verbatim at its nearest step |
| vendor palette | `node tokens/import-palette.mjs --source tailwind\|radix …` |
| extract from product | `node adopt/infer-tokens.mjs --write` (from `${CLAUDE_PLUGIN_ROOT}/templates/adopt/`) |
| preset | nothing — the shipped template files are the preset |

Then `node tokens/build.mjs`, and **heed the contrast gate**. A light-peaking hue (greens,
ambers) prints a finding naming its real fill step; apply the documented re-point rather than
distorting the ramp. B is done when the gate exits zero.

B needs no `node_modules` — both scripts are dependency-free by design, which is what lets
this chain run under the install.

### Phase 1 — C css-systems ∥ D motion

C wires `tokens/dist/` into the chosen CSS system so `color.bg.accent` is reachable the
idiomatic way (a Tailwind `@theme` block, a vanilla-extract contract, a StyleX `defineVars`,
a Panda preset, a plain CSS-var sheet). D writes the motion tokens' consumers: the
reduced-motion strategy and the shared animation primitives.

D runs **before** the components deliberately. `Dialog` animates on day one, so the motion
pattern must already exist for its author to consume rather than invent.

### Phase 2 — wave 1, four authors

`Button` · `TextField` · `Dialog` · `Icon + Box/Stack/Inline`. See `SKILL.md` for why these
four and `component-roadmap.md` for everything after. Each dispatch must say, explicitly:

- the harness, lint config and build config **already exist** — write only your own directory
- consult `component-api-design`, `primitive-libraries`, `css-systems`, `component-testing`
- **do not regenerate the registry**
- siblings are running concurrently; do not edit shared files

### Phase 3 — J lint ∥ K inventory

Independent: J reads the generated token file, K reads the registry. J *tunes* the baseline
config A installed — the custom rules against the real token names — rather than creating it.

K builds the registry (it is the only agent in this phase allowed to), copies and adapts
`${CLAUDE_PLUGIN_ROOT}/templates/inventory/`, authors the Patterns and Content starter pages
by hand — the one deliberately hand-written part of the site, because cross-component
judgement has no code to be generated from — and emits `AGENTS.md` and `llms.txt` from the
same registry. It also wires visual regression from
`${CLAUDE_PLUGIN_ROOT}/templates/testing/playwright.config.ts` and
`${CLAUDE_PLUGIN_ROOT}/templates/testing/vrt/inventory.vrt.spec.ts`, which screenshot the
inventory site itself — so every component's visual baseline comes free with its docs page
instead of needing a second story-authoring pass.

## What must stay serial, and why

- **Tokens before everything.** Nothing can be styled against tokens that do not exist. This
  is the one genuinely load-bearing serialisation in the build.
- **Registry after all components, before the surfaces.** Both J and K read a registry that
  must already describe the full wave.
- **Verification last, and only in the parent.** See rule 4.
- **Wave 2 is not in this graph at all.** Init stops after wave 1 on purpose: everything
  after multiplies whatever the wave-1 grammar got right or wrong, so the user sees three
  reference components in their own colours before fifty more are built on the same
  assumptions. The inventory site opening in their browser *is* that gate.

## Fallback: no Workflow tool

Same graph, dispatched as `Agent` calls. The rule that makes it parallel is **one message,
several tool calls** — agents dispatched in separate messages run serially and you have
bought nothing:

1. One message: A + B.
2. One message: C + D. (Strictly, C and D can go as soon as B returns even if A has not; if
   the harness makes that awkward, waiting for both costs only the install tail.)
3. One message: the four component authors.
4. Parent: `npm run registry`.
5. One message: J + K.
6. Parent: verify, in parallel.
