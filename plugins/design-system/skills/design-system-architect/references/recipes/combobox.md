# Combobox

Wave 3 · layer-dependent · Select + free text + async. Build it AFTER Select has shipped and
settled the field anatomy: Combobox reuses TextField's field and Select's popup wholesale, and it
is the hardest form control in the system — any anatomy mistake Select would have caught cheaply
gets fixed twice, in the hardest place, if Combobox goes first. That is why the roadmap sequences
them.

## Primitive mapping

| Layer | Ships it as | The work left for you |
|---|---|---|
| Base UI | A `Combobox` compound (input, popup, list, item parts) | Styling and tokens. It is a newer part of the library than Select — verify part names against the installed version's docs before writing a single import. |
| React Aria | `ComboBox` (capital B) + `Label` + `Input` + `Button` + `Popover` + `ListBox` + `ListBoxItem` | Same, and `allowsCustomValue` plus async patterns are documented first-class. |
| Radix | **Not shipped.** | Compose `Popover` + a listbox you own, or bring `downshift`'s `useCombobox` for the wiring. Neither is free: composing means owning `aria-activedescendant`, highlight state, scroll-into-view and touch behaviour yourself; Downshift buys that wiring but is a second behaviour library with its own focus philosophy living inside a Radix system. Budget it as a custom component either way, at roughly three Select's worth of effort. |

## The two-value model (the classic bug lives here)

A combobox has **two values**: the text in the input and the committed selection. They are
separate props with separate change events, and conflating them is *the* combobox bug — typing
"ber" must not clear the selection or fire `onValueChange`; selecting must write the item's
label into the input without a spurious `onInputChange` loop.

```tsx
interface ComboboxProps<T extends string = string> {
  value?: T | null; defaultValue?: T | null; onValueChange?: (value: T | null) => void;
  inputValue?: string; defaultInputValue?: string; onInputChange?: (text: string) => void;
  items: ReactNode;               // <Combobox.Item> children — ALREADY filtered, see below
  loading?: boolean;              // async in flight; keeps the popup open, renders the loading slot
  empty?: ReactNode;              // rendered when open with zero items and not loading
  allowsCustomValue?: boolean;    // default false — see the trade-off below
  label: string; description?: string; error?: string;  // TextField's anatomy, unchanged
  size?: 'sm' | 'md'; disabled?: boolean; required?: boolean; name?: string;
}
```

Both pairs are controlled AND uncontrolled, and the parity test runs for **each** independently.

## Filtering is userland — refuse to own it

The DS renders exactly the items it is given. The consumer filters (`startsWith`, `Intl`-aware
matching, a fuzzy ranker, or a server query) and passes the result down. A DS that owns filtering
owns debouncing, async race handling, ranking opinions, and diacritic/locale matching — four
product decisions wearing a prop's name, re-litigated at every call site that wants them
different. React Aria's `useFilter` is fine — it runs on the consumer's side of the line.

**Async** is the same rule with a loading state: the consumer debounces and fetches; the DS
provides `loading` (renders a non-interactive loading row, sets `aria-busy` on the listbox and
keeps the popup open so results don't flash closed) and the `empty` slot ("No results for 'x'" is
the consumer's copy; the DS supplies the slot, not the sentence).

## `allowsCustomValue`

Off (default): blur reverts the input to the committed selection's text — typing is only a way to
find an item. On: the typed text itself becomes a value, `onValueChange` can emit strings not in
the list, and validation of them belongs to the consumer. Decide per use: "pick a country" is
off; "add a tag" is on. Don't default it on — most call sites want a closed set, and the open set
silently breaks consumers who treat the value as an id.

## States and focus

`data-highlighted` on the active item, `data-selected`, `data-open`/`data-state` per layer —
style from these, as in Select. Critically: **DOM focus never leaves the input.** The primitive
points at the active option with `aria-activedescendant`; the highlight moves, the caret stays.
Never "fix" this by focusing list items — it breaks text editing mid-navigation and is the
expensive 80% the primitive exists to own. Tokens: the field is TextField's field, the popup and
items are Select's popup and items — nothing new to mint.

## Keyboard map (the test contract asserts every row)

| Keys | Where | Action |
|---|---|---|
| typing | anywhere | Opens, updates `inputValue`; consumer filters, DS re-renders items |
| `ArrowDown` / `ArrowUp` | closed | Opens, highlights first (or selected) item |
| `ArrowDown` / `ArrowUp` | open | Moves highlight; focus stays in the input |
| `Home` / `End` | anywhere | **Caret to start/end of the text** — never list navigation; a combobox that steals Home/End from the input breaks text editing |
| `Enter` | open | Commits the highlighted item, closes |
| `Escape` | open | Closes without committing; input reverts per `allowsCustomValue` |
| `Tab` | open | Closes and moves on — assert whichever commit behaviour the primitive defaults to, don't override it |

## Test contract, beyond Select's

- The non-filtering proof: pass items that do NOT match the current input text and assert they
  all render — the day someone "helpfully" adds internal filtering, this is the test that fails.
- Two-value independence: typing fires `onInputChange` only; selecting fires both and sets the
  input text; a controlled `value` with a non-updating parent does not drift.
- `document.activeElement` remains the input throughout arrow navigation (activedescendant, not
  focus), and the highlighted item is scrolled into view.
- `allowsCustomValue` off: blur reverts the input text to the selection.
- `loading`: listbox has `aria-busy`, popup stays open; zero items + not loading renders `empty`.
- Axe with the popup open, including the loading row.

## Meta seeds (do/don't)

- **Do** use when options exceed ~15 or come from a server. **Don't** use for a small known set —
  that is Select, with no text-editing state to manage and no filter to explain.
- **Do** keep filtering and debouncing beside the data they filter. **Don't** accept a
  `filter`/`debounce` prop into the DS — that is the first step of the ownership creep above.
- **Don't** grow multi-select tags in here. Token/tag input is a different component with a
  different keyboard model (Backspace deletes chips); bolting it on doubles every state.
