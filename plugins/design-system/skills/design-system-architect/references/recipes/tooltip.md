# Tooltip

Wave 2 · primitive-backed in all three layers · inherits Dialog's portal and positioning rules and
none of its focus management — a tooltip never receives focus, and most of this recipe follows from that.

## Primitive mapping

| Layer | Ships it as | The work left for you |
|---|---|---|
| Base UI | `Tooltip` compound (Provider/Root/Trigger/Portal/Positioner/Popup) | Styling, delay tuning, tokens. Hover **and** focus triggering, hoverability and Escape dismissal are bought. |
| Radix | `@radix-ui/react-tooltip` compound (Content in place of Positioner/Popup; Provider owns the delays) | Same. |
| React Aria | `TooltipTrigger` + `Tooltip` from `react-aria-components` | Same — and it refuses to attach to a non-focusable trigger. That is a feature: a tooltip on an unfocusable element is invisible to keyboard users by construction. |

Verify part names against the installed version's docs before writing imports — compound part naming
is exactly the level that shifts between majors. **Never** hand-roll this on `onMouseEnter`: the
primitive is where WCAG 1.4.13's three requirements live — *dismissable* (Escape, without moving the
pointer), *hoverable* (the pointer can cross onto the popup without it closing), *persistent* (stays
until hover/focus ends or it is dismissed) — and a hand-rolled tooltip reliably fails at least two.

## Props API sketch

```tsx
interface TooltipProps {
  content: ReactNode;             // text, optionally an icon or kbd hint — never anything interactive (see meta)
  children: ReactElement;         // the trigger. Must be focusable: keyboard users get the tooltip via focus or not at all
  delay?: number;                 // ms before opening on hover. Target ~600; set it explicitly — layer defaults range ~600ms to 1.5s
  side?: 'top' | 'bottom' | 'left' | 'right';  // a preference, not a promise — collision handling flips it; style from data-side
  open?: boolean; defaultOpen?: boolean; onOpenChange?: (open: boolean) => void;
}
```

The flattened API is right here, unlike Dialog: one content slot, and the arrangement never varies.
Also mount the layer's **provider part once per app** — it owns group delay: the first tooltip waits
~600ms, but moving to an adjacent trigger inside the grace window opens instantly. Without it, a
five-button toolbar is five separate 600ms waits, and hover-scanning it feels broken.

## States (style from these, never from React state)

`data-open` / `data-state="open|closed"` per layer on the popup, plus `data-side` — set
`transform-origin` from it so the tooltip grows out of the trigger. Radix additionally distinguishes
`data-state="delayed-open"` from `"instant-open"`: animate only the delayed one, so skipping across a
toolbar does not replay the entrance animation on every trigger.

## Tokens consumed

Surface — a genuine fork, decide once: the classic inverse look (dark surface, light text) has no
pair in the semantic set, so it needs component tokens (`tooltip.bg`, `tooltip.fg`) — hardcoding
`neutral.900` breaks the first re-theme. The alternative is the standard overlay surface:
`color.bg.raised` + `color.border.subtle` + `shadow.overlay`, zero new tokens but less instantly
read as ephemeral. Text `type.caption`, padding `space.1` × `space.2`, `radius.sm`. Stack:
`z.tooltip` — deliberately the top of the scale (above modal and toast), because a tooltip can open
from inside either and must never render under its own trigger's overlay. Motion: `duration.fast` +
`easing.decelerate` in; out at `duration.instant` — the user who left has already moved on.

## Keyboard map (the test contract asserts every row)

| Keys | Where | Action |
|---|---|---|
| `Tab` (focus reaches trigger) | closed | Opens with **no delay** — delay filters accidental pointer crossings; a keyboard user has already committed |
| `Tab` / blur away | open | Closes |
| `Escape` | open | Closes without moving focus — and must not close an ancestor Dialog on the same keypress |

## Test contract, beyond the generic suite

- Focus-triggered open: keyboard-focus the trigger → open immediately; blur → closed. This is the
  half of the trigger contract people skip, and the only half keyboard users get.
- While open, the trigger's `aria-describedby` resolves to the tooltip node, and the trigger's
  accessible **name** is unchanged — the tooltip supplements the name, it never replaces it.
- Escape ordering: trigger inside an open Dialog, tooltip open → first Escape closes only the
  tooltip, second closes the Dialog.
- Hoverable: pointer travels from trigger onto the tooltip without it closing. jsdom has no hover
  geometry — this one runs in the browser-mode/Playwright suite.
- Axe with the tooltip **open** — `role="tooltip"` and the describedby link only exist then.

## Meta seeds (do/don't)

- **Do** use to supplement: expand an icon-only button's label, reveal truncated text, show a
  shortcut. **Don't** make it the only route to information — touch devices have no hover, and
  long-press is undiscoverable; the same info must exist somewhere tappable.
- **Don't** put links or buttons inside — the tooltip closes while the pointer travels toward it,
  so interactive content in it is unreachable by design. That content wants a Popover.
- **Don't** tooltip a `disabled` button: disabled elements fire no pointer events and never take
  focus, so the "why is this disabled" tooltip opens for no one. Keep the control enabled and
  explain on activation, or put the tooltip on a wrapper.
- **Do** let the trigger keep its own accessible name and add detail via the tooltip. **Don't**
  point `aria-label` at the tooltip text — a "Save (⌘S, syncs to all devices)" *name* is what
  screen-reader users then hear on every pass through the toolbar.
