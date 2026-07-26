# Component roadmap — the build order for a complete v1

This is the canonical order. Each wave is gated on the one before it — not for ceremony,
but because each wave *validates* something the next wave depends on, and finding a wrong
decision one wave late costs a rewrite of everything built on it. Within a wave, components
are independent: fan them out as parallel `ds-component-author` dispatches (one message,
one agent per component), and regenerate the registry once when they all return.

## Wave 1 — the foundation set (built by init)

**Button · TextField · Dialog**, plus **Icon** and the layout primitives **Box · Stack · Inline**.

The three reference components are chosen because between them they exercise every hard
problem in the system, and every later component is a variation on one of them:

- **Button** — variants, sizes, states, icon slots, polymorphism (`render`/`asChild`), the
  loading pattern, the icon-only/`aria-label` type constraint.
- **TextField** — label/description/error wiring, controlled *and* uncontrolled, form
  integration, `aria-describedby` chains. Every other form control copies this anatomy.
- **Dialog** — portal, focus trap, focus restoration, scroll lock, enter/exit animation.
  Every other overlay (Popover, Menu, Tooltip, Toast, Drawer) is this with different
  positioning and dismissal rules.

**Icon** ships in wave 1 because Button already has icon slots on day one — a system whose
reference component renders ad-hoc SVGs teaches ad-hoc SVGs. The wrapper is
`${CLAUDE_PLUGIN_ROOT}/templates/components/Icon/Icon.tsx`; the `icon-system` skill owns
the library decision and the a11y rules.

**Box, Stack and Inline** ship in wave 1 — earlier than most teams expect — because they
are what stops product teams hand-rolling flex divs. The day the system lands, someone
needs to put a Button next to a TextField, and if the system has no answer they write
`<div style={{ display: 'flex', gap: 12 }}>` — a raw dimension the lint rules flag with no
sanctioned alternative to point at. This is the Atlassian/Polaris/Primer pattern: layout
primitives whose style props are **token-gated** (`gap="4"` resolves `--ds-space-4`;
`gap={13}` is a type error), so spacing decisions stay on the scale without anyone reading
a lint message. They are also the cheapest components in the system — no state, no ARIA,
no primitives to wrap — so they cost one authoring pass and pay out in every layout
written afterwards. The trade-off to state honestly: a `Box` with too many style props
becomes CSS-in-props and competes with the CSS system. Gate the prop list to layout
(spacing, alignment, direction, wrap) and stop; colour and typography stay in components
and tokens.

**Gate:** the user has seen all three reference components rendered in their colours and
said yes. Everything after this point multiplies whatever the wave-1 API grammar got right
or wrong.

## Wave 2 — the working set (~12 components, one parallel fan-out)

The components a product team asks for in their first month. All are buildable
concurrently — each is a variation of a wave-1 pattern, none depends on another:

| Component | What it exercises (and inherits) |
|---|---|
| Select | TextField's field anatomy + Dialog's popup/positioning |
| Checkbox | Field anatomy; indeterminate state |
| Radio + RadioGroup | Group context, roving focus — first composite focus model |
| Switch | Checkbox's shape with different semantics (instant effect, not form value) |
| Tooltip | Hover/focus timing, `aria-describedby`, the never-put-actions-in-it rule |
| Popover | Dialog's portal/focus logic, non-modal |
| Menu | Popover + typeahead + roving focus; the `role="menu"` keyboard contract |
| Tabs | Roving focus, controlled/uncontrolled selection, lazy panels |
| Toast | Queueing, timers, `role="status"` politeness, pause-on-hover |
| Badge | First pure-presentation component — proves the token/variant grammar alone |
| Card | Composition surface; slots without state |
| Avatar | Image loading states, fallback initials |
| Spinner + Skeleton | The two loading vocabularies; ship together so the decision rule (see the inventory's Patterns page) has both halves |

**Gate:** the registry builds clean, the status board shows keyboard tests and an axe pass
per component, and the fan-out found no gaps in the wave-1 token/motion layer (it will —
fix them here, before wave 3 multiplies them).

## Wave 3 — the completeness set

The components that make teams stop keeping a second component library around. Also
parallelisable, but these are bigger — expect Table and DatePicker to each cost what three
wave-2 components cost:

- **Combobox** — Select + free text + async loading. The hardest form control; do it after
  Select has settled the field anatomy.
- **Table / DataTable** — sorting, selection, sticky headers. Decide the boundary
  deliberately: render + a11y in the DS, data logic (TanStack Table or similar) in
  userland — a DS that swallows data fetching is unmaintainable.
- **DatePicker** — locale, timezone, range selection. The classic scope sink; wrapping the
  primitive layer's calendar (if it has one) beats building one.
- **Accordion** — disclosure grammar, `aria-expanded`.
- **Banner / Alert** — Toast's messaging vocabulary, inline and persistent.
- **Progress** — determinate + indeterminate, `aria-valuenow`.
- **Pagination** — pure composition of Button + Icon; almost free by now.
- **Breadcrumbs** — nav semantics, truncation.
- **EmptyState** — composition of Icon + type + Button; exists so empty states are
  designed once (the Patterns page defines the three kinds).
- **Navigation (side/top)** — the biggest composition surface; last because it consumes
  half the components above it.

## Ready-made vs genuinely custom

What the primitive layer gives you matters for estimating a wave. Roughly:

- **Primitive-backed in all three layers (Base UI, Radix, React Aria):** Select, Checkbox,
  Radio, Switch, Tooltip, Popover, Menu, Tabs, Accordion, Progress, Avatar. For these the
  work is styling, tokens, tests and meta — the behaviour is bought.
- **Layer-dependent:** Toast (Base UI and Radix ship one), Combobox (Base UI and React
  Aria ship one; on Radix, compose Popover + a listbox or bring Downshift), DatePicker and
  Table and Breadcrumbs (React Aria only), Navigation menu (Radix and Base UI only). Where
  the layer lacks it, budget it as custom.
- **Genuinely custom everywhere:** Box/Stack/Inline, Badge, Card, Spinner, Skeleton,
  Banner/Alert, Pagination, EmptyState. No primitive exists because there is no behaviour
  to abstract — these are pure token + composition work, which is why they are cheap.

## What is deliberately not on the roadmap

Charts, rich text editors, file uploaders, drag-and-drop. Each is a product-sized problem
wearing a component-sized name. Wrap a dedicated library per product need; putting them in
the DS commits the DS team to maintaining a chart library forever.
