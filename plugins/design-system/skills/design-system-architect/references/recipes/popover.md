# Popover

Wave 2 · primitive-backed in all three layers · inherits Dialog's portal, positioning and
focus-restoration logic with the trap removed — non-modal is the whole point, and the whole risk.

## Primitive mapping

| Layer | Ships it as | The work left for you |
|---|---|---|
| Base UI | `Popover` compound (Root/Trigger/Portal/Positioner/Popup, plus Title/Description/Close) | Styling, tokens. Positioning, collision flipping, dismissal and focus restoration are bought. |
| Radix | `@radix-ui/react-popover` compound (Content in place of Positioner/Popup; adds Anchor for positioning against something other than the trigger) | Same. |
| React Aria | `DialogTrigger` + `Popover` + `Dialog` from `react-aria-components` — a popover there is literally a positioned Dialog | Same — and note it exposes placement as `data-placement`, not `data-side`/`data-align`; the CSS below needs adapting. |

Verify part names against the installed version's docs before writing imports — compound part naming
is exactly the level that shifts between majors. **Never** hand-roll the outside-click/focus-out
dismissal: "clicked outside" is genuinely hard (portals mean DOM containment lies, and a click on a
nested Select's popup is *inside* by intent while outside by ancestry) — the primitive tracks the
logical tree, your `contains()` check does not.

## Props API sketch

```tsx
// Compound, not flattened — popover content is arbitrary (filters, forms, pickers), so the
// arrangement varies, which is exactly when parts beat props (see component-api-design).
interface PopoverRootProps {
  open?: boolean; defaultOpen?: boolean; onOpenChange?: (open: boolean) => void;
}
interface PopoverContentProps {
  side?: 'top' | 'bottom' | 'left' | 'right';  // preferences, not promises — collision handling
  align?: 'start' | 'center' | 'end';           //   flips them; style from data-side, never from these
  children: ReactNode;
}
// Parts: Popover.Root / Trigger / Content / Close, mapped onto whatever the layer names them.
```

Focus behaviour is the contract: on open, focus moves **into** the popup (first tabbable, else the
popup itself); on close, it restores to the trigger; in between it is **not trapped** — Tab walks
out, the page behind stays interactive, scroll is not locked. Do not "improve" any of these: a
popover that traps focus is a Dialog with worse semantics, and one that leaves focus on the trigger
strands keyboard users outside their own popup.

## States (style from these, never from React state)

`data-open` / `data-state="open|closed"` per layer on the popup, plus `data-side` and `data-align` —
set `transform-origin` from the pair so the popup scales from its anchor point, not from a fixed
corner. When collision handling flips it to the other side, the animation flips with it for free;
hardcoded `transform-origin: top center` is the tell of a popover styled without these attributes.

## Tokens consumed

The surface is Dialog's, one level lighter: `color.bg.raised`, `color.border.subtle`,
`shadow.overlay` (not `shadow.modal` — reserve that weight for things that block the page),
`radius.lg`, `space.4` padding. Stack: `z.popover` — above `z.modal` on the scale, because a popover
opened from inside a Dialog must render over it. Motion: `duration.fast` + `easing.decelerate` in,
`duration.fast` + `easing.accelerate` out, scale from ~0.96 + fade — full-distance slides read as
the popup arriving from elsewhere rather than belonging to the trigger.

## Keyboard map (the test contract asserts every row)

| Keys | Where | Action |
|---|---|---|
| `Enter` / `Space` | trigger | Toggles; on open, focus moves into the popup |
| `Escape` | open | Closes, focus returns to the trigger |
| `Tab` / `Shift+Tab` | open | Moves through the popup's tabbables; past either end it **exits** (no trap) — assert the layer's default, don't override it |

## Test contract, beyond the generic suite

- Focus restoration **per close path**: Escape → trigger focused; `Popover.Close` → trigger focused;
  outside click → closed *without* yanking focus back — the clicked element keeps it. The third case
  is the one blanket "restores focus on close" implementations get wrong.
- Non-modality: with the popup open, click a button in the page behind → that button's handler fires
  and the popover closes. A focus trap or scroll lock fails this test; that is the test's job.
- Controlled parity: drive `open` externally, assert `onOpenChange` fires for every dismissal path
  (Escape, outside click, Close) — consumers wiring controlled popovers hit the missing-callback
  path immediately.
- Axe with the popup **open** — the accessible name/description wiring only exists then.
- Collision flipping needs real layout — jsdom reports none. Assert `data-side` in the
  browser-mode/Playwright suite or not at all; a jsdom assertion on it tests the default, silently.

## Meta seeds (do/don't)

- **Do** use for supplementary controls anchored to a trigger: filter panels, date pickers, share
  controls, a profile card. **Don't** use for confirmations or destructive flows — a popover
  dismisses on any outside click, which is exactly the misclick a confirm exists to catch. That is
  Dialog's contract.
- **Do** reach for Dialog when the content must be completed or read before continuing — forms with
  required fields, anything whose half-finished state is lost on dismiss. A popover says "glance and
  move on"; content that punishes dismissal is in the wrong container.
- **Don't** fill one with a list of actions — that is Menu, which brings the `role="menu"` keyboard
  contract (typeahead, arrows, Home/End) a popover full of buttons silently lacks.
- **Do** keep the trigger a real button showing open state (`aria-expanded` comes from the
  primitive). **Don't** open popovers from hover — hover-open plus interactive content is the
  reachability problem Tooltip has, reinvented on a surface that was supposed to fix it.
