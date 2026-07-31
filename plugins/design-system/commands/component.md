---
description: Add a new component to the design system — API, styles, tests, docs, registry entry, all consistent with the existing system
argument-hint: "<component name> [notes, e.g. 'Combobox, async loading, multi-select']"
---

# Add a design system component

Component requested: `$ARGUMENTS`

Read `design-system.config.json` first (search upward from cwd; if there is none, tell the user to run `/design-system:init` and stop). It tells you the primitive layer, CSS system, motion library and conventions this system already uses — match them exactly. A component that does not match the house style is a defect, not a variation.

Then:

1. **Check the registry** (`.design-system/registry.json`) — does a component already cover this? Extending an existing component beats adding a near-duplicate. Say so if that is the case.
2. **Dispatch a `ds-component-author` subagent** to build it. That agent owns the full recipe — props contract (`component-api-design`), primitive wrapping (`primitive-libraries`), token-only styling (`css-systems`), motion (`motion-system`), the behavioural suite (`component-testing`) and the `.meta.json`. Do not re-run that recipe inline: it pulls every one of those skills plus every authored file into this conversation, which is exactly the context weight that makes the rest of the session slow. Pass the agent the component name, the notes from `$ARGUMENTS`, and the resolved config. **If a per-component recipe exists** at `${CLAUDE_PLUGIN_ROOT}/skills/design-system-architect/references/recipes/<name>.md` (kebab-case; every wave-2/3 roadmap component has one), pass that path too — it settles the primitive mapping, props sketch, keyboard map and test contract before the agent starts, and the agent must justify deviations in the meta file.
3. **Several components requested?** Dispatch one author per component, **all in a single message so they run in parallel** — components are independent of each other; serially they cost the sum, in parallel they cost the slowest. Tell each: do not regenerate the registry (concurrent regens race on `registry.json`). If the request is open-ended ("the next wave", "round out the library"), read `${CLAUDE_PLUGIN_ROOT}/skills/design-system-architect/references/component-roadmap.md` — it is the canonical build order, says what each component exercises, and which are primitive-backed versus custom — and fan out the wave from it.
4. When the author(s) return, **regenerate the registry once** so the inventory and `AGENTS.md` pick the work up.

Verify — typecheck, tests, lint **as parallel tool calls in one message** (they are independent), then the component rendering in the inventory site. Report real output.
