---
description: Interview + scaffold a complete React design system (tokens, components, inventory site, tests, lint, packaging)
argument-hint: "[optional: brand/product name, or notes like 'fintech, dark-first, Base UI + Tailwind']"
---

# Create a design system

You are standing up a **production React design system** in this repository. The user's notes (may be empty): `$ARGUMENTS`

Invoke the `design-system-architect` skill now and follow it end to end. It owns the interview, the brief, and the build order.

The short version of what must happen — the skill has the detail:

1. **Survey** the repo first (package manager, React version, existing styling, existing components, monorepo or not). Never ask a question the repo already answers; pre-fill it and confirm instead.
2. **Interview** the user with `AskUserQuestion` in exactly two rounds:
   - Round 1 — *stack*: headless primitive layer · component layer · CSS system · motion library.
   - Round 2 — *design + delivery*: colour direction · typography · distribution · scope.
   Pre-select the option that matches `$ARGUMENTS` or the repo, and say why it is recommended.
3. **Write the brief** to `design-system.config.json` at the DS root. This file is the contract every later command reads. Show it to the user before building.
4. **Scaffold** — a serial spine, then a parallel fan-out (each step is a skill — invoke it, don't improvise):
   `design-tokens` → `css-systems` → `motion-system` → primitive install + shared test/lint harness, **then the three reference components (`Button`, `TextField`, `Dialog`) as three `ds-component-author` subagents dispatched in a single message** — they are independent once tokens, CSS wiring and motion exist, and building them inline is both the slowest stretch of init and the one that bloats the conversation. Parent regenerates the registry once when all three return, then `design-system-linting` → `component-inventory` → `packaging-distribution` (only if the brief says package).
5. **Verify before claiming done**: run the token build first (everything reads its output), then typecheck, tests, lint and the inventory build **as parallel tool calls in one message** — they are independent, and together they cost the slowest one instead of the sum. Report the actual command output. If something fails, fix it — do not report a green build you did not see.

Templates live in `${CLAUDE_PLUGIN_ROOT}/templates/`. Copy and adapt them rather than writing files from memory — they are the tested versions.

Finish by printing a short map of what was created, the commands the team now has (`npm run tokens`, `npm run inventory`, `npm run test`, `npm run lint:ds`), and the follow-up slash commands (`/design-system:component`, `/design-system:tokens`, `/design-system:audit`).
