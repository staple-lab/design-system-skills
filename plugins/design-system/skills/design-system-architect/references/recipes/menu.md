# Menu

Wave 2 · primitive-backed in all three layers · inherits Popover's overlay surface and dismissal,
plus the `role="menu"` keyboard contract — typeahead, roving focus, and the fire-and-close rule.

## Primitive mapping

| Layer | Ships it as | The work left for you |
|---|---|---|
| Base UI | `Menu` compound (Root/Trigger/Portal/Positioner/Popup/Item, plus group, separator, checkbox/radio item and submenu parts) | Styling, tokens. Roving focus, typeahead, hover intent and the close-on-activate plumbing are bought. |
| Radix | `@radix-ui/react-dropdown-menu` compound (Content in place of Positioner/Popup; Item/Group/Label/Separator, CheckboxItem/RadioItem, Sub/SubTrigger/SubContent) | Same. |
| React Aria | `MenuTrigger` + `Popover` + `Menu` + `MenuItem` from `react-aria-components` | Same — items take `onAction`, and selection-mode items are a documented mode of the same parts, not a separate component. |

Verify part names against the installed version's docs before writing imports — compound part naming
is exactly the level that shifts between majors. **Never** compose this from Popover plus styled
buttons: typeahead, roving `tabIndex` management, first-letter navigation and submenu hover intent
(the "safe polygon" between pointer and submenu) are the expensive 80% you would be signing up to
own, and their absence is invisible until a keyboard user hits the menu.

## Props API sketch

```tsx
// Compound only — a flattened items={[...]} array dies on the first separator, group label,
// icon slot or submenu, then grows a renderer prop, which is children rebuilt worse.
interface MenuItemProps {
  onSelect?: () => void;   // the action. The menu closes itself afterwards — do not also close it by hand
  disabled?: boolean;      // rendered and announced but not activatable — a vanished item can't explain itself
  tone?: 'default' | 'danger';  // danger styles the item; it does NOT confirm — see meta
  children: ReactNode;     // label, optionally with an icon slot and a trailing shortcut hint
}
// Parts: Menu.Root / Trigger / Content / Item / Group / GroupLabel / Separator, mapped per layer.
```

Menu items are **actions**: they fire and the whole tree closes. If an item needs to *display*
persistent state, that is the layer's checkbox/radio item parts (which announce `aria-checked`) —
never a hand-rolled check icon next to a plain item, which looks identical and announces nothing.

## States (style from these, never from React state)

`data-highlighted` on items — not `:hover`; arrow keys and typeahead must light items identically to
the pointer. `data-disabled` on items, `data-state="open|closed"` / `data-open` on the popup and on
a submenu's trigger (style the open submenu trigger as highlighted, or it goes dark while its child
is open), plus `data-side`/`data-align` on the popup for transform-origin, as in Popover.

## Tokens consumed

The popup is Popover's surface, one size denser: `color.bg.raised`, `color.border.subtle`,
`shadow.overlay`, `radius.md`, `space.1` popup padding. Items: `space.2` padding, `radius.sm`
(inner radius < popup radius, per the nesting rule), `type.body-sm`, `color.fg.default` with
`color.bg.subtle-hover` on `data-highlighted`, `color.fg.muted` for shortcut hints,
`color.fg.danger` for `tone="danger"`, `color.fg.disabled` for disabled. Stack: `z.dropdown` — it is
anchored to its trigger like Select, not floating like Popover. Motion: `duration.fast` +
`easing.decelerate` in, `easing.accelerate` out.

## Keyboard map (the test contract asserts every row)

| Keys | Where | Action |
|---|---|---|
| `Enter` / `Space` / `ArrowDown` | closed trigger | Opens, focus to first item |
| `ArrowUp` | closed trigger | Opens, focus to last item — the row people forget; assert it |
| `ArrowDown` / `ArrowUp` | open | Moves highlight (roving focus; wrap per layer default) |
| `Home` / `End` | open | First / last item |
| `a-z` typeahead | open | Highlight jumps to the next item starting with that letter |
| `ArrowRight` / `ArrowLeft` | submenu trigger / inside submenu | Opens submenu, focus to its first item / closes it, focus back to the submenu trigger |
| `Enter` | open | Activates the item, closes the **whole tree**, focus returns to the root trigger |
| `Escape` | open | Closes without activating, focus returns to the trigger |
| `Tab` | open | Closes the menu — a menu is one tab stop, its items are not in the tab order |

## Test contract, beyond the generic suite

- Activation: `onSelect` fires exactly once, every open menu level closes, focus lands on the root
  trigger. Compare against Escape (closes, no `onSelect`) — the two paths restore focus identically.
- A disabled item does not fire `onSelect` on click or Enter, and does not close the menu.
- Typeahead across a realistic item set, including two items sharing a first letter — repeated
  presses advance to the next match rather than sticking.
- Submenu: opening a submenu keeps the parent open; `ArrowLeft` closes only the submenu and returns
  focus to its trigger, not to the root.
- Axe with the menu **open**: `role="menu"` requires `menuitem` children, and a stray wrapper
  element between them breaks that required relationship — invisible in the closed state.

## Meta seeds (do/don't)

- **Do** use for actions on a thing: Duplicate, Rename, Move, Delete on a row or card. **Don't**
  use it to hold a current choice ("Sort: name ▾" as plain items) — displaying selection is
  Select's contract, or the layer's radio-item parts if it truly lives among actions; a plain item
  can fire but never announces what is currently chosen.
- **Don't** build site navigation as a Menu. `role="menu"` switches screen readers into an
  application interaction mode — arrow keys, one tab stop, "menu" announcements — which is wrong
  for a list of links. A `<nav>` landmark with a plain list beats it: cheaper, and users keep
  ordinary link navigation (Tab, links list, open-in-new-tab).
- **Do** cap submenus at one level, with the primitive's hover intent. **Don't** nest deeper — a
  second level fails on touch (no hover) and turns pointer travel into a dexterity test; overflow
  belongs in a Dialog or its own page.
- **Do** put destructive items last, separated, in `tone="danger"`, confirming in a Dialog *after*
  the menu closes. **Don't** confirm inside the menu — the menu has already closed by the time the
  user must decide, and an outside click discarding a half-made destructive choice is Popover's
  dismissal problem at its highest stakes.
