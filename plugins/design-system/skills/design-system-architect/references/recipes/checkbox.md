# Checkbox

Wave 2 · primitive-backed in all three layers · inherits TextField's label/description/error
anatomy on a control the size of one line of text.

## Primitive mapping

| Layer | Ships it as | The work left for you |
|---|---|---|
| Base UI | `Checkbox` compound (Root/Indicator) — renders a hidden input for form posts | Styling, field anatomy, tokens. Behaviour is bought. |
| Radix | `@radix-ui/react-checkbox` compound (Root/Indicator) — types `checked` as `boolean \| 'indeterminate'` | Same, plus mapping: keep your public `checked` boolean and translate a separate `indeterminate` prop onto Radix's tri-state internally. Don't leak the union into your API. |
| React Aria | `Checkbox` from `react-aria-components` — one component; you render the box and check glyph yourself from its state | Same, and label/description/error come via its `Label`/`Text` slots — use them, don't bolt on your own ids. |

Verify part names against the installed version's docs before writing imports — compound part
naming is exactly the level that shifts between majors. Never hand-roll this on a styled `<div
role="checkbox">`: the hidden-input form plumbing, label association and `aria-checked="mixed"`
wiring are the parts you'd get subtly wrong.

## Props API sketch

```tsx
interface CheckboxProps {
  checked?: boolean; defaultChecked?: boolean;
  onCheckedChange?: (checked: boolean) => void;  // boolean in, boolean out — 'mixed' never travels through this
  indeterminate?: boolean;  // display + ARIA state, NOT a third value: parent-driven, cleared by the parent
  label: ReactNode;         // required — a bare 16px box is unlabellable and unclickable; the label IS the hit area
  description?: ReactNode; error?: string;  // TextField's slots, TextField's aria-describedby chain
  disabled?: boolean; required?: boolean;
  name?: string; value?: string;  // form posts name=value only while checked; value defaults to "on", like the DOM
}
```

`indeterminate` is deliberately not a value of `checked`. It means "some of my children are
checked" — a report, not an answer. The user cannot set it: activating an indeterminate checkbox
fires `onCheckedChange(true)`, and the mixed display persists only until the parent recomputes and
drops the prop. Modelling it as `checked: 'indeterminate'` (Radix's internal shape) puts a state
in the form value that no form can post.

## States (style from these, never from React state)

Per layer: Radix `data-state="checked|unchecked|indeterminate"`, Base UI `data-checked`/
`data-unchecked`/`data-indeterminate`, React Aria `data-selected`/`data-indeterminate` — plus
`data-disabled` and a focus-visible attribute or `:focus-visible` on all three. The indeterminate
glyph is a dash, not a faded check: a faded check reads as "checked, disabled".

## Tokens consumed

The box: 16px visual (`space.4`), `radius.sm`, `border-width.md` border in `color.border.strong` —
the unchecked boundary must hit 3:1 against the page (WCAG 1.4.11), which `color.border.default`
is not guaranteed to do. Checked/indeterminate: `color.bg.accent` fill, `color.fg.on-accent`
glyph, border transparent. Disabled: `color.bg.disabled`, `color.fg.disabled`. Focus:
`color.ring` at `focus.ring-width`/`focus.ring-offset`. Label `type.body` + `color.fg.default`,
description `type.body-sm` + `color.fg.muted`, error `color.fg.danger`, gap `space.2`. Glyph
draw-in: `duration.fast` + `easing.standard`. The row's hit area extends to ≥44px square via
padding or a pseudo-element (Button's trick) — a raw 16px box is a 16px touch target, which is a
miss rate you can measure.

## Keyboard map (the test contract asserts every row)

| Keys | Action |
|---|---|
| `Space` | Toggles. From indeterminate → checked, never → unchecked |
| `Enter` | Does **not** toggle — native checkboxes ignore Enter; inside a form it submits. Assert the non-event: a checkbox that toggles on Enter double-fires on form submit |
| `Tab` / `Shift+Tab` | Moves focus in/out; one tab stop per checkbox (unlike RadioGroup) |

## Test contract, beyond the generic suite

- Clicking the label text toggles the box — the association is the anatomy's whole point, and it
  silently breaks when someone restructures the DOM without `htmlFor`/wrapping-label.
- `indeterminate` → `aria-checked="mixed"`; activate → `onCheckedChange(true)` fires and, with a
  parent that doesn't clear the prop, the display **stays** mixed (parity with the controlled-Select
  non-updating-parent assertion).
- Controlled/uncontrolled parity: same click script, same rendered state both ways.
- Form integration: checked posts `name=value`, unchecked posts **nothing** — absence is the DOM
  contract, and serialisers that expect `false` need to learn it here, not in production.
- Hit area ≥44×44 while the visual box stays 16px (assert via `getBoundingClientRect` on the
  interactive element, not the glyph).
- `error` set → `aria-invalid` on the control and the error text in its `aria-describedby` chain.

## Meta seeds (do/don't)

- **Do** use for choices that take effect on Save/submit. **Don't** use where flipping it acts
  immediately — that is Switch's contract, and a checkbox that mutates on click surprises everyone
  who expected to review before submitting.
- **Do** reserve indeterminate for a parent over a partially-checked list. **Don't** offer it as a
  "no answer" third option — users cannot produce the mixed state, so it can never be an input.
- **Do** phrase labels positively: "Send me updates". **Don't** phrase negatively: "Don't send
  updates" — checked-means-no is a double negative, and the miscomprehension shows up as support
  tickets, not errors.
- **Do** use a checkbox group for picking several of ≤7 visible options. **Don't** use a lone
  Yes/No radio pair for one boolean — that is a checkbox wearing two controls' worth of UI.
