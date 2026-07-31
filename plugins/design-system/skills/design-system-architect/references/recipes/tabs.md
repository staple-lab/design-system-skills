# Tabs

Wave 2 · primitive-backed in all three layers · inherits Radio's roving-focus model (one tab stop,
arrows move within) and Button's control styling for the tab triggers.

## Primitive mapping

| Layer | Ships it as | The work left for you |
|---|---|---|
| Base UI | `Tabs` compound (Root/List/Tab/Panel, plus `Indicator` — a part that tracks the active tab for the animated underline) | Styling, overflow, tokens. The List owns roving focus; activation mode is a List-level prop (`activateOnFocus`). |
| Radix | `@radix-ui/react-tabs` (Root/List/Trigger/Content) | Same; activation via `activationMode="automatic\|manual"` on Root. No indicator part — animate a pseudo-element or accept an instant swap. |
| React Aria | `Tabs` + `TabList` + `Tab` + `TabPanel` from `react-aria-components` | Same; `keyboardActivation` on Tabs. Selection uses `selectedKey`/`onSelectionChange`, not `value` — adapt at the wrapper so the system-wide `value` grammar holds. |

Verify part and prop names against the installed version's docs before writing imports — activation-mode
props especially are named differently in every layer and shift between majors. Never hand-roll the
roving tabindex: one stop for the whole list, arrows move focus, and the *selected* (not first) tab is
the stop — the primitive gets all three right and a `tabIndex={0}` on every tab silently breaks it.

## Props API sketch

```tsx
interface TabsProps {
  value?: string; defaultValue?: string; onValueChange?: (value: string) => void;  // both modes, always
  activation?: 'automatic' | 'manual';   // default 'automatic' — see below
  orientation?: 'horizontal' | 'vertical';  // vertical flips the arrow axis; the primitive handles it
  children: ReactNode;   // <Tabs.List><Tabs.Tab value/>…</Tabs.List><Tabs.Panel value keepMounted?/>
}
```

**Automatic vs manual activation.** Automatic: arrowing to a tab selects it — one keystroke per
switch, and the sighted-keyboard experience matches the mouse one. Its cost: every arrow press
renders (and possibly fetches) a panel, so a user arrowing across six tabs to reach the last one
loads five panels they never wanted. Manual: arrows only move focus; Enter/Space selects. Choose
manual when panels are expensive (network per panel), destructive (switching discards work), or
slow enough that automatic makes arrowing feel broken. Default automatic — it is what the ARIA APG
recommends when panels are cheap, and most are.

**Lazy vs eager panels.** Default lazy (unselected panels unmounted): cheap mount, nothing hidden
renders. The trade-off is state: an unmounted panel loses its form state, scroll position and video
playback — a half-filled form in panel A is gone after a glance at panel B. `keepMounted` on the
panel keeps it in the DOM (hidden) so state survives switching; pay that cost per panel that holds
state, not globally.

**Overflow: scroll, never wrap.** A two-row tab bar reads as two unrelated bars, and which tab wraps
changes with viewport width. `overflow-x: auto` on the list, scroll the selected tab into view on
change, and if the set outgrows scrolling it has outgrown tabs — that is a Select or a nav.

## States (style from these, never from React state)

Selected tab: `data-selected` (Base UI, React Aria) or `data-state="active|inactive"` (Radix) — on
the panel too. Plus `data-disabled`, `data-orientation` on list/tab/panel (style the vertical layout
from it), and React Aria's `data-focus-visible`. The indicator part (Base UI) exposes position via
CSS variables — check the installed version's docs for their names rather than guessing.

## Tokens consumed

Tabs: `color.fg.muted` resting → `color.fg.default` selected and hovered, `type.label`,
`space.3` inline padding, `space.2` block. List: `color.border.subtle` bottom rule. Indicator:
`color.border.accent`, sliding with `duration.fast` + `easing.standard` (movement between
siblings, not an entrance — `standard`, not `decelerate`). Focus: `focus.ring-width`, `color.ring`,
`focus.ring-offset` on the tab, `:focus-visible` only. Panel: `space.4` top padding.

## Keyboard map (the test contract asserts every row)

| Keys | Where | Action |
|---|---|---|
| `Tab` | page | Into the list: lands on the **selected** tab, not the first. Again: leaves the list into the panel — never to the next tab |
| `ArrowRight` / `ArrowLeft` | list (horizontal) | Moves focus to next/previous tab; automatic mode also selects it |
| `ArrowDown` / `ArrowUp` | list (vertical) | Same, on the vertical axis |
| `Home` / `End` | list | First / last tab |
| `Enter` / `Space` | manual mode | Selects the focused tab; in automatic mode selection already happened |

## Test contract, beyond the generic suite

- One tab stop: with tab 2 selected, `Tab` from outside lands on tab 2; `Tab` again lands inside the
  panel, not on tab 3. This is the roving-focus assertion, and it fails loudly if anyone adds
  `tabIndex` to a tab.
- Activation modes: automatic — arrow moves `aria-selected` with focus; manual — arrow moves focus
  while `aria-selected` stays put until Enter/Space. Assert both configurations.
- Wiring: each tab's `aria-controls` is its panel's id; the panel's `aria-labelledby` is its tab's
  id — assert via `getByRole('tabpanel', { name: /tab label/ })`, which fails if either id dangles.
- `keepMounted`: type into an input in panel A, switch to B and back — the value survives with
  `keepMounted` and is gone without it. Assert both, so losing form state is a decision, not a surprise.
- Controlled with a non-updating parent: clicking a tab must NOT switch the panel (the
  two-sources-of-truth regression).

## Meta seeds (do/don't)

- **Do** use for peer views of one thing — Details / Activity / Settings on the same record.
  **Don't** use for sequential steps: a wizard has order and validation between steps; tabs promise
  free navigation in any order, and users believe the promise.
- **Do** keep every tab's content self-contained. **Don't** use tabs when users need to compare the
  panels' contents — only one is ever visible; comparison wants side-by-side layout.
- **Do** let the list scroll when it overflows. **Don't** wrap to a second row — two rows read as
  two unrelated bars, and resizing reshuffles which tab lives where.
- **Do** switch to `activation="manual"` when a panel switch fetches or discards work. **Don't**
  nest a tab bar inside a panel of another tab bar — two levels of "where am I" is a navigation
  redesign wearing a component.
