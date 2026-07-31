# Radio + RadioGroup

Wave 2 · primitive-backed in all three layers · inherits TextField's anatomy at group level and
Checkbox's box styling; the system's **first composite focus model** — get it right here and Menu
and Tabs are variations, get it wrong and you'll re-litigate it twice.

## Primitive mapping

| Layer | Ships it as | The work left for you |
|---|---|---|
| Base UI | `RadioGroup` + `Radio` compound (Radio.Root/Radio.Indicator) | Styling, group anatomy, tokens. Roving focus is bought. |
| Radix | `@radix-ui/react-radio-group` compound (Root/Item/Indicator) | Same. |
| React Aria | `RadioGroup` + `Radio` from `react-aria-components`, with its own `Label`/`Text`/`FieldError` slots | Same, and use its slots for the group label/error — don't bolt on your own ids. |

Verify part names against the installed version's docs before writing imports — compound part
naming is exactly the level that shifts between majors. Never build this from loose Checkboxes
with exclusivity logic: the single-tab-stop roving focus, RTL arrow flipping and
`role="radiogroup"` wiring are the actual component.

## Props API sketch

```tsx
interface RadioGroupProps<T extends string = string> {
  value?: T; defaultValue?: T; onValueChange?: (value: T) => void;  // controlled AND uncontrolled, always both
  label: ReactNode;               // the question — required at group level, not per item
  description?: ReactNode; error?: string;  // group-level, like TextField: the error describes the group ("Pick a plan"), never one item
  disabled?: boolean; required?: boolean; name?: string;  // one name for the whole group — it is one form field
  orientation?: 'vertical' | 'horizontal';  // vertical default; tells ARIA and the arrow-key axis, not just CSS
  children: ReactNode;            // <Radio value="…" label="…"/> items — compound, not an options array (see Select for why)
}

interface RadioProps {
  value: string;
  label: ReactNode;               // per-item answer; the label is the hit area, same as Checkbox
  description?: ReactNode;        // consequences belong here, visible — not in a tooltip
  disabled?: boolean;             // a disabled item is skipped by arrows but should stay visible and explain itself
}
```

Selection state lives on the **group**, never on items — a `checked` prop on `Radio` is the API
smell that says someone is rebuilding exclusivity by hand.

## States (style from these, never from React state)

Per item: Radix `data-state="checked|unchecked"`, Base UI `data-checked`/`data-unchecked`,
React Aria `data-selected` — plus `data-disabled` and focus-visible per layer. The group carries
`data-orientation` and, when `error` is set, `aria-invalid` — style the item borders from the
group's invalid state so one error message colours all boxes, not one.

## Tokens consumed

The circle is Checkbox's box with `radius.full`: 16px visual (`space.4`), `border-width.md` in
`color.border.strong` (3:1 non-text contrast on the unchecked boundary — 1.4.11). Checked:
`color.bg.accent` ring or fill with a `color.fg.on-accent` / `color.bg.default` dot; dot appears
with `duration.fast` + `easing.standard`. Disabled `color.bg.disabled`/`color.fg.disabled`; focus
`color.ring` at `focus.ring-width`/`focus.ring-offset`. Group label `type.label`, item labels
`type.body`, descriptions `type.body-sm` + `color.fg.muted`, error `color.fg.danger`. Item gap
`space.3` vertical (`space.6` horizontal), circle-to-label gap `space.2`. Each item row extends
its hit area to ≥44px, same pseudo-element trick as Checkbox.

## Keyboard map (the test contract asserts every row)

| Keys | Action |
|---|---|
| `Tab` | Enters the group on the **checked** item — or the first enabled item if none checked. One tab stop for the whole group |
| `Tab` / `Shift+Tab` (inside) | Exits the group entirely — the next stop is the next field, not the next radio |
| `ArrowDown` / `ArrowRight` | Moves focus to the next item **and selects it**, wrapping past the end — moving-selects is the native radio contract, unlike listbox where highlight and selection are separate |
| `ArrowUp` / `ArrowLeft` | Previous item, selects, wraps. Left/Right flip in RTL — the primitive handles it; don't intercept arrow keys or you own RTL |
| `Space` | Selects the focused item when the group has no selection yet (arrows already selected otherwise) |

## Test contract, beyond the generic suite

- **One tab stop**: from a control before the group, Tab lands on the checked item; Tab again
  lands *after* the group. This is the assertion that fails when someone renders items as sibling
  buttons — and the whole reason this component gates wave 2's other roving-focus components.
- Each arrow press fires `onValueChange` — selection moves with focus; asserting only the final
  value would pass a broken listbox-style implementation.
- Wrap: ArrowDown on the last item selects the first. Disabled items are skipped, not landed on.
- Controlled/uncontrolled parity: same arrow script, same result; and a controlled group with a
  non-updating parent must NOT move the dot (the two-sources-of-truth regression).
- Form integration: submitting posts `name=value` once for the group; nothing when unselected.
- Axe with `error` set: the group has `aria-invalid` and the error text is in the group's
  `aria-describedby` chain — group-level, not duplicated onto every item.

## Meta seeds (do/don't)

- **Do** use for one-of-2-to-5 options the user should compare at a glance. **Don't** stretch past
  ~6 — the group's height crowds the form and Select's collapsed trigger wins; below 4, radios
  beat Select for the same reason in reverse.
- **Do** make "None"/"No preference" an explicit item when it's a legitimate answer. **Don't** rely
  on leaving the group untouched — a radio group cannot be unselected once the user clicks
  anything, so the empty state is unreachable after the first touch.
- **Do** ship a `defaultValue` when a recommended option exists. **Don't** default-select for
  consent or billing choices — cursoring through a radio group *changes the value* (that's the
  contract above), so a screen-reader user browsing the options has already re-picked one.
- **Do** put each option's consequence in its `description`. **Don't** differentiate options only
  in a tooltip or the surrounding paragraph — forms-mode screen readers read the group label and
  item labels, and skip prose between fields.
