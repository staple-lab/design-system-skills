# Switch

Wave 2 · primitive-backed in all three layers · inherits Checkbox's shape and label anatomy —
but not its semantics: a switch acts **now**, a checkbox records a value for later.

## Primitive mapping

| Layer | Ships it as | The work left for you |
|---|---|---|
| Base UI | `Switch` compound (Root/Thumb) | Styling, tokens. `role="switch"` + `aria-checked` wiring is bought. |
| Radix | `@radix-ui/react-switch` compound (Root/Thumb) | Same. |
| React Aria | `Switch` from `react-aria-components` — one component; you render track and thumb yourself from its state | Same, with the label as the component's child rather than a separate slot. |

Verify part names against the installed version's docs before writing imports — compound part
naming is exactly the level that shifts between majors. Do not "save a dependency" by restyling
Checkbox with a track: `role="switch"` vs `role="checkbox"` changes what screen readers announce
("on/off" vs "checked/unchecked"), and VoiceOver/NVDA users rely on that difference to know
whether the control acts immediately.

## Props API sketch

```tsx
interface SwitchProps {
  checked?: boolean; defaultChecked?: boolean;
  onCheckedChange?: (checked: boolean) => void;  // the app applies the effect HERE, immediately — there is no Save coming
  label: ReactNode;   // the state's NAME ("Email notifications"), never a question or a verb phrase —
                      // it is announced as "<label>, switch, on": "Enable notifications?, switch, on" answers nothing
  description?: ReactNode;  // scope and consequence ("Applies to this device only")
  // no error slot, deliberately: a switch's value is applied the instant it changes, so there is
  // no "invalid until submitted" window for an error to live in. Need validation? That's Checkbox.
  disabled?: boolean;
  name?: string; value?: string;  // for the rare form-embedded switch; see the meta — usually a smell
}
```

No `indeterminate`: `aria-checked="mixed"` is not part of the switch pattern and the layers don't
offer it. A "partially on" setting is a group of switches, not one ambiguous one.

## States (style from these, never from React state)

Per layer: Radix `data-state="checked|unchecked"`, Base UI `data-checked`/`data-unchecked`,
React Aria `data-selected` — plus `data-disabled` and focus-visible. The thumb position derives
from the same attribute on the root, so track colour and thumb travel can never disagree. If the
effect is async, keep the switch in the *requested* state while in flight and revert on failure —
never add a `data-loading` third visual; a switch with three states has lost its one advantage.

## Tokens consumed

Track: `radius.full`, width two thumbs (`space.10`), height `space.6`. Off: `color.bg.subtle-active`
— it must hit 3:1 against the page (1.4.11), because the track *is* the control's boundary and
off-state must not read as disabled. On: `color.bg.accent`. Disabled: `color.bg.disabled`. Thumb:
`color.bg.default` + `shadow.raised` (a surface token, not raw white — the thumb must stay visible
on both track colours in both themes), inset by `space.1`, travelling with `duration.fast` +
`easing.standard` — transform only; under `prefers-reduced-motion` the thumb jumps, and the
track's colour change carries the feedback. Focus: `color.ring` at `focus.ring-width`/
`focus.ring-offset`. Label `type.body`, description `type.body-sm` + `color.fg.muted`, gap
`space.2`. The visual is ~24px tall: extend the row's hit area to ≥44px, Checkbox's pseudo-element
trick.

## Keyboard map (the test contract asserts every row)

| Keys | Action |
|---|---|
| `Space` | Toggles, and the effect applies immediately |
| `Enter` | Layer-dependent: toggles where the primitive renders a real `<button>`; the ARIA switch pattern makes Enter optional. Assert whichever the installed layer does — don't normalise it and inherit the maintenance |
| `Tab` / `Shift+Tab` | Moves focus in/out; one tab stop |

## Test contract, beyond the generic suite

- `role="switch"` and `aria-checked="true|false"` on the interactive element — not `role=
  "checkbox"`, not `aria-pressed`. This is the assertion that catches a restyled-Checkbox
  implementation, and it's cheap.
- `onCheckedChange` fires on the *same* click/keypress, before any async work — the instant-effect
  contract, distinguishable from a submit-later control only by asserting the timing.
- Clicking the label toggles the switch (Checkbox's association test, re-run here because React
  Aria's child-label structure differs from the others).
- Controlled/uncontrolled parity, and the controlled non-updating-parent case: the thumb must NOT
  move — an optimistic thumb with a rejecting parent is the two-sources-of-truth regression in its
  most visible form.
- Axe on both states: the off-state track against the page is where the 3:1 non-text contrast
  failure hides; the on-state passes trivially.

## Meta seeds (do/don't)

- **Do** use for settings that apply the moment they're flipped: notifications, dark mode, Wi-Fi.
  **Don't** use inside anything with a Save/Submit button — a switch *promises* instant effect, so
  a switch that waits for Save lies twice: once when flipped, again if the user leaves without
  saving. That's Checkbox.
- **Do** label with the state's name and keep it stable: "Email notifications". **Don't** use
  questions or imperative verbs ("Enable notifications?", "Turn on emails") — and never flip the
  label text with the state, or "on" becomes unparseable in the accessibility tree.
- **Do** revert the switch and explain (toast/inline text) when the underlying call fails.
  **Don't** confirm-then-apply with a dialog — a switch that asks "are you sure?" has admitted it
  isn't instant; a genuinely dangerous toggle should be a Button with a confirmation instead.
- **Do** keep it strictly binary: one thing, on or off. **Don't** use it to pick between two modes
  ("Grid / List") — a switch's off-state reads as *disabled*, not as the other option; a
  two-option choice is a RadioGroup (or segmented control) where both answers have names.
