# Select

Wave 2 · primitive-backed in all three layers · inherits TextField's field anatomy and Dialog's popup rules.
A reference template exists at `${CLAUDE_PLUGIN_ROOT}/templates/components/Select/` (CSS Modules form, Base UI
primitive) — adapt it to the repo's stack rather than starting blank.

## Primitive mapping

| Layer | Ships it as | The work left for you |
|---|---|---|
| Base UI | `Select` compound (Root/Trigger/Value/Icon/Portal/Positioner/Popup/Item/ItemText/ItemIndicator, plus Group/GroupLabel) | Styling, field anatomy, tokens. Behaviour is bought. |
| Radix | `@radix-ui/react-select` compound (Content/Viewport in place of Positioner/Popup; adds ScrollUp/DownButton) | Same. Note Radix Select's popup is select-menu positioned (over the trigger), not popover-positioned — a visual difference to decide on, not a bug. |
| React Aria | `Select` + `Button` + `SelectValue` + `Popover` + `ListBox` + `ListBoxItem` from `react-aria-components` | Same, and label/description/error come via its own `Label`/`Text` slots — use them, don't bolt on your own ids. |

Verify part names against the installed version's docs before writing imports — compound part
naming is exactly the level that shifts between majors. **Never** compose this from a Popover and
a hand-rolled listbox when the layer ships a Select; typeahead, wheel/touch scrolling and
`aria-activedescendant` management are the expensive 80% you'd be signing up to own.

## Props API sketch

```tsx
interface SelectProps<T extends string = string> {
  value?: T; defaultValue?: T; onValueChange?: (value: T) => void;  // controlled AND uncontrolled, always both
  label: string;                  // required — a select without a label is a WCAG failure, make the type say so
  description?: string; error?: string;   // TextField's exact anatomy: same slots, same aria-describedby chain
  placeholder?: string;
  size?: 'sm' | 'md';             // md default; heights come from control.height.*, same as Button/TextField
  disabled?: boolean; required?: boolean; name?: string;  // name: form posts need it — this is a form control first
  children: ReactNode;            // <Select.Item value="…">…</Select.Item> — compound, not an options array prop
}
```

Compound items, not an `options={[...]}` array: an array prop is tidier until the first item needs
an icon, a description line, or a disabled state with a reason — then it grows a renderer prop and
you have rebuilt children, worse. Keep `Select.Item`, `Select.Group`, `Select.Separator` as parts.

## States (style from these, never from React state)

`data-disabled`, `data-placeholder` (trigger showing no value), `data-highlighted` (item under
cursor/cursor-key), `data-selected` (item), popup `data-state="open|closed"` or `data-open`
per layer, plus `data-side` on the popup — style transform-origin from it so the popup animates
from the trigger.

## Tokens consumed

The trigger is TextField's field: `color.bg.default`, `color.border.default` → `color.border.focus`,
`control.height.{sm,md}`, `control.padding-x`, `radius.md`, `type.body`. The popup is Dialog's
surface: `color.bg.surface`, `shadow.overlay`, `z.dropdown`, `radius.md`. Items:
`color.bg.subtle-hover` for `data-highlighted` (not `:hover` — cursor keys must light items
identically), `color.fg.default`/`color.fg.muted`, `space.2` padding. Motion:
`duration.fast` + `easing.decelerate` in, `easing.accelerate` out.

## Keyboard map (the test contract asserts every row)

| Keys | Where | Action |
|---|---|---|
| `Enter` / `Space` / `ArrowDown` | closed trigger | Opens, focus to selected (or first) item |
| `ArrowUp` / `ArrowDown` | open | Moves highlight; does not wrap silently past ends |
| `Home` / `End` | open | First / last item |
| `a-z` typeahead | open **and** closed | Jumps to next match — closed-state typeahead is the behaviour people forget exists; assert it |
| `Enter` / `Space` | open | Selects highlighted, closes, focus returns to trigger |
| `Escape` | open | Closes without selecting, focus returns to trigger |
| `Tab` | open | Closes and moves focus on (per layer default) — assert whichever the primitive does, don't override it |

## Test contract, beyond the generic suite

- Popup/focus: open → focus lands in popup; close by each path (select, Escape, outside click) →
  focus restored to trigger. This is the family of assertions Button's suite never exercises.
- Controlled/uncontrolled parity: same interaction script, same rendered value both ways; and the
  controlled case with a non-updating parent must NOT change the displayed value (the two-sources-
  of-truth regression, caught only if you assert it).
- Form integration: inside a `<form>`, submitting posts `name=value` (the hidden-input plumbing
  differs per layer; the assertion doesn't).
- Axe: run with the popup **open** — the closed state passes trivially.
- `error` set → trigger has `aria-invalid` and the error text is in its `aria-describedby` chain.

## Meta seeds (do/don't)

- **Do** use for choosing one of 4–15 known options. **Don't** use for 3 or fewer — radios show
  all options in one glance for the same cost; a select hides them behind a click.
- **Do** reach for Combobox instead when options exceed ~15 or are async — scrolling a Select of
  200 items is the interaction Combobox exists to replace. **Don't** add a filter input inside
  Select; that is Combobox built badly.
- **Do** keep the trigger showing the *selected value*. **Don't** use a Select as an action menu
  ("Export as…" that fires on selection) — that is Menu's contract; a Select that navigates or
  mutates on change breaks every user who cursors through options to hear them.
- **Do** pair `error` with text via the description slot. **Don't** signal invalid by border
  colour alone — 3:1 contrast on a 1px border is not a message.
