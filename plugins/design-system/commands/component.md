---
description: Add a new component to the design system — API, styles, tests, docs, registry entry, all consistent with the existing system
argument-hint: "<component name> [notes, e.g. 'Combobox, async loading, multi-select']"
---

# Add a design system component

Component requested: `$ARGUMENTS`

Read `design-system.config.json` first (search upward from cwd; if there is none, tell the user to run `/design-system:init` and stop). It tells you the primitive layer, CSS system, motion library and conventions this system already uses — match them exactly. A component that does not match the house style is a defect, not a variation.

Then:

1. **Check the registry** (`.design-system/registry.json`) — does a component already cover this? Extending an existing component beats adding a near-duplicate. Say so if that is the case.
2. Invoke `component-api-design` for the props contract. Resolve, explicitly:
   - controlled / uncontrolled / both (and the `defaultX` + `onXChange` pair)
   - composition shape: single component with props, or compound parts (`Foo.Root` / `Foo.Item`)
   - polymorphism: `render` prop (Base UI), `asChild` (Radix), or `as` — whatever the rest of the system uses
   - variants + sizes, and which are token-driven
   - forwarded ref, `...rest` spread onto which element, `data-*` state attributes for styling
3. Invoke `primitive-libraries` for the correct primitive and its a11y contract (roles, focus management, keyboard map). If the primitive layer already ships this component, wrap it — never re-implement a focus trap or a listbox by hand.
4. Invoke `css-systems` to style it with **semantic tokens only**. No raw hex, no magic numbers. Any new value becomes a token first.
5. Invoke `motion-system` if it opens, closes, expands or reorders — use the motion tokens and respect `prefers-reduced-motion`.
6. Invoke `component-testing` and write the behavioural suite before you claim it works: keyboard map, controlled/uncontrolled parity, ref forwarding, `data-*` states, axe clean in every variant, RTL user-event flows.
7. Add the **registry entry** — this is what makes the component visible to both the inventory site and to AI agents. Fill in every field: status, props, slots, a11y notes, do/don't, examples, tokens consumed.
8. Regenerate docs: run the registry build so the inventory picks it up.

Verify: typecheck, tests, lint, and the component rendering in the inventory site. Report real output.
