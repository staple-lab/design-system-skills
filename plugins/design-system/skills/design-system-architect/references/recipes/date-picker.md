# DatePicker

Wave 3 · layer-dependent (React Aria only) · the classic scope sink. The rule that contains it:
**wrap the primitive layer's calendar; never build one.** A hand-rolled calendar is months of
i18n — calendar systems beyond Gregorian (Japanese eras, Buddhist, Hebrew, Islamic), locale
week-start and weekday names, RTL month navigation, leap rules — all invisible in the en-US demo
and all broken on someone's device.

## Primitive mapping

| Layer | Ships it as | The work left for you |
|---|---|---|
| React Aria | `DatePicker` / `DateRangePicker` = `DateField` (typed segments) + `Button` + `Popover` + `Calendar`, with values from `@internationalized/date` (`CalendarDate` etc.) | Styling and tokens. The one layer where this component's behaviour is bought — locale, calendar systems and the grid keyboard contract come from the primitive. |
| Base UI | **Not shipped.** | Two honest options. (a) Use react-aria's hooks (`useDatePicker`, `useCalendar` + `@internationalized/date`) for this component only — cost: a second behaviour library scoped to one component; record the exception in the brief so it doesn't spread. (b) Bring a dedicated calendar core (e.g. `react-day-picker`) inside the layer's Popover — cost: you still own the typed date field and the two libraries' focus handoff. |
| Radix | **Not shipped.** | Same two options, same costs. |

Either way, budget it like three wave-2 components. If neither option is acceptable, the right
call is often to *not ship* DatePicker in v1 rather than to hand-roll a calendar.

## The value type: never a raw `Date` for a date-only value

A `Date` is an instant; a date is not. `new Date("2026-03-15")` parses as UTC midnight, so a
user in UTC−5 sees "Mar 14" the moment it is formatted locally — the classic off-by-one that
appears only for users west of Greenwich, i.e. not on the CI machine. Date-only values are a
plain calendar triple: `{ year, month, day }`, the platform's `Temporal.PlainDate`, or
`@internationalized/date`'s `CalendarDate` (which is what React Aria emits). Datetime is a
separate `granularity`, and the moment time enters, the timezone must be explicit in the type —
not inherited from whatever machine renders. The same rule extends past the component: a
date-only value serialized as `"2026-03-15T00:00:00Z"` re-imports the bug at the API boundary.

## Range is a mode, not a second component

```tsx
type DatePickerProps<D = DateValue> = Common & (
  | { mode?: 'single'; value?: D | null; onValueChange?: (v: D | null) => void }
  | { mode: 'range'; value?: { start: D; end: D } | null; onValueChange?: (v: { start: D; end: D } | null) => void }
);
// Common: label (required), description?, error?, minValue?, maxValue?,
//         isDateUnavailable?, granularity?, size?, disabled?, name?
```

One catalogue entry, one anatomy, one docs page; `mode` flips the value type through a
discriminated union so a range handler on a single picker will not compile. The honest cost:
the underlying primitive may be two components (React Aria's `DatePicker` / `DateRangePicker`),
and the union makes docgen prop tables uglier. If that fight is lost, shipping `DateRangePicker`
as a thin alias of the same anatomy is acceptable — two components with *drifting* anatomy is not.

## Always allow typed input beside the calendar

The field is a **segmented** date field (day / month / year segments; arrows adjust, digits
type), never a freeform text input to parse — "3/4/2026" is March 4 or April 3 depending on
locale, and segments sidestep parsing entirely. A picker-only control punishes keyboard users
and anyone entering a distant date: a birthdate is ~360 PageUp presses into the past. The
calendar is the affordance for *nearby* dates; the segments are the primary input.

## Constraints: `minValue` / `maxValue` / `isDateUnavailable` — with a reason

A greyed-out date with no explanation is a support ticket. Per-cell tooltips on disabled days
are not reliably reachable, so put the reason in the field's visible copy — the `description`
slot ("Deliveries run Tue–Sat") or `error` after an invalid segment entry — and let the calendar
merely reflect it. Unavailable dates stay in the grid (a missing day breaks week-column
counting); they render disabled and unselectable.

## States and tokens

Field states are TextField's; the popup is Dialog's surface (`color.bg.raised`,
`shadow.overlay`, `z.popover`, `radius.lg`). Calendar cells: `space.8` (32px) square hit areas,
`radius.sm`; hover `color.bg.subtle-hover`; selected `color.bg.accent` + `color.fg.on-accent`;
today marked by more than colour alone (e.g. a `border-width.md` ring in `color.border.accent`);
unavailable `color.fg.disabled`; range interiors `color.bg.accent-subtle` with the endpoints
solid. Style from the primitive's cell data-attributes (`data-selected`, `data-unavailable`,
`data-outside-month` — verify exact names per layer), never from mirrored React state.

## Keyboard map (the ARIA grid pattern for calendars; assert every row)

| Keys | Where | Action |
|---|---|---|
| `ArrowLeft` / `ArrowRight` | calendar grid | ±1 day |
| `ArrowUp` / `ArrowDown` | calendar grid | ±1 week |
| `PageUp` / `PageDown` | calendar grid | ±1 month; with `Shift`, ±1 year |
| `Home` / `End` | calendar grid | Start / end of the week |
| `Enter` / `Space` | calendar grid | Selects the focused date (range: first press sets start, second sets end) |
| `Escape` | popup open | Closes without selecting; focus returns to the trigger |
| `ArrowUp` / `ArrowDown` | field segment | Increments / decrements that segment; digits type directly |
| `ArrowLeft` / `ArrowRight` | field | Moves between segments |

## Test contract, beyond the generic suite

- **The timezone test:** run the selection suite under `TZ=Pacific/Apia` (UTC+13) and
  `TZ=America/Adak` (UTC−10): picking "15 March 2026" yields `{2026, 3, 15}` and re-renders as
  15 March in both. Every raw-`Date` implementation fails exactly this test.
- A range spanning a DST transition counts the right number of days (date arithmetic must never
  touch clock time).
- Typing a full date into the segments updates the value without opening the calendar.
- `minValue`/`maxValue`: out-of-range dates are not selectable; typed out-of-range entry sets
  the field invalid with the error in the `aria-describedby` chain.
- Grid keyboard rows above, including month/year paging across month boundaries.
- Axe with the calendar open; the grid has an accessible name that includes the visible month.

## Meta seeds (do/don't)

- **Do** use for scheduling-range dates (appointments, deadlines) where the calendar aids
  choice. **Don't** lead with the calendar for known distant dates — birthdates are typed.
- **Don't** store or transmit date-only values as ISO datetimes; keep them calendar values
  end to end.
- **Do** state constraints in visible copy. **Don't** leave disabled dates unexplained.
- **Don't** add `granularity` datetime "just in case" — time drags timezone into every
  consumer's data model; add it only where time is genuinely part of the answer.
