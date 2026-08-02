---
description: Interview + scaffold a complete React design system (tokens, components, inventory site, tests, lint, packaging)
argument-hint: "[optional: brand/product name, or notes like 'fintech, dark-first, Base UI + Tailwind']"
---

# Create a design system

You are standing up a **production React design system** in this repository. The user's notes (may be empty): `$ARGUMENTS`

Invoke the `design-system-architect` skill now and follow it end to end. It owns the interview, the brief, and the build order.

The short version of what must happen — the skill has the detail:

1. **Survey** the repo first (package manager, React version, existing styling, existing components, monorepo or not). Never ask a question the repo already answers; pre-fill it and confirm instead.
2. **Interview** the user with `AskUserQuestion` in exactly three rounds:
   - Round 1 — *stack*: headless primitive layer · component layer · CSS system · motion library.
   - Round 2 — *design + delivery*: colour direction · typography · distribution · scope.
   - Round 3 — *the specifics*: the brand colour input (only if the colour answer left one open) · icon pack · system name · default theme.
   **Never ask the user to go and look up their brand hex.** Most people cannot recite it — the brand exists as a logo, a stylesheet, a live site or a PDF. Survey for brand assets first, offer the paths you actually found (plus a URL via Other), run `${CLAUDE_PLUGIN_ROOT}/templates/tokens/extract-brand.mjs` over them, then confirm the accent with a question whose options are the extracted candidates.
   Pre-select the option that matches `$ARGUMENTS` or the repo, and say why it is recommended.
   **Collect every answer through `AskUserQuestion` — never ask the user to type a setting as prose.** Values that look like free text (a brand hex, a system name) become a question with four good defaults plus **Other**, which is where custom input goes. That is strictly better than a bare prompt, and it is the difference between an answer you can write into the brief and one that arrives as conversation.
3. **Write the brief** to `design-system.config.json` at the DS root. This file is the contract every later command reads. Show it to the user before building.
4. **Build it in parallel — never inline, and never in the order the steps are written.** The dependency graph is four phases deep, not seven steps, and its two slowest parts (`npm install` and the token/CSS/motion authoring) are independent of each other. Read `${CLAUDE_PLUGIN_ROOT}/skills/design-system-architect/references/build-phases.md` first: it holds the phase graph, the per-agent file-ownership table, and the four races that ownership prevents.
   - **If the `Workflow` tool is available**, run `${CLAUDE_PLUGIN_ROOT}/templates/workflows/build-design-system.mjs` with `args: { pluginRoot, dsRoot, brief }` (`pluginRoot` must be an absolute path — `${CLAUDE_PLUGIN_ROOT}` does not expand inside a workflow script). It encodes the graph as deterministic phases, keeps every agent's file output out of the conversation, and returns a structured report.
   - **Otherwise** dispatch the same phases as subagents, **one message per phase with several `Agent` calls in it** — agents dispatched in separate messages run serially and you have bought nothing.
   Either way the shape is: `scaffold+install` ∥ (`design-tokens` → `css-systems` ∥ `motion-system`) → four `ds-component-author` agents (`Button`, `TextField`, `Dialog`, and one for `Icon` + `Box`/`Stack`/`Inline`) → **parent builds the registry once** → `design-system-linting` ∥ `component-inventory` → `packaging-distribution` (only if the brief says package).
5. **Verify before claiming done**: run the token build first (everything reads its output), then typecheck, tests, lint and the inventory build **as parallel tool calls in one message** — they are independent, and together they cost the slowest one instead of the sum. Report the actual command output. If something fails, fix it — do not report a green build you did not see.
6. **End with a working URL — this is the final act, every time.** Launch `npm run inventory -- --open` **in the background** (foreground hangs the session), read the port Vite actually printed, and put that URL on its own line as the **last thing in your final message**. **Never assume 5173** — Vite increments when the port is taken, and a confidently wrong URL sends the user to a dead page or someone else's dev server. Everything else (file map, npm scripts, follow-up commands, the wave-2 offer) goes above the link. Skip `--open` when headless/CI and just print the URL.

Templates live in `${CLAUDE_PLUGIN_ROOT}/templates/`. Copy and adapt them rather than writing files from memory — they are the tested versions.

Finish by printing a short map of what was created, the commands the team now has (`npm run tokens`, `npm run inventory`, `npm run test`, `npm run lint:ds`), and the follow-up slash commands (`/design-system:component`, `/design-system:tokens`, `/design-system:audit`).

Then offer wave 2 — but do not build it inside init. Init's scope ends at the wave-1 gate
(the roadmap's reason: everything after multiplies whatever the wave-1 grammar got right or
wrong, so the user must see and approve the three reference components first). Point at
`/design-system:component` with the open-ended form ("build wave 2") — it fans out one
`ds-component-author` per component in parallel, each seeded with its recipe from
`${CLAUDE_PLUGIN_ROOT}/skills/design-system-architect/references/recipes/`.
