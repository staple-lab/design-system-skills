# Progress

Wave 3 · primitive-backed in all three layers · one component for determinate and indeterminate —
`value` present or absent is the whole switch, not two components.

## Primitive mapping

| Layer | Ships it as | The work left for you |
|---|---|---|
| Base UI | `Progress` compound in `@base-ui/react` | Styling, tokens, the label/percentage layout. ARIA plumbing is bought. |
| Radix | `@radix-ui/react-progress` | Same. It is the smallest Radix primitive — the buy is the ARIA correctness, not code volume. |
| React Aria | `ProgressBar` from `react-aria-components` | Same, and it has an indeterminate mode and label slot built in — use its label wiring, don't bolt on your own ids. |

Verify part names against the installed version's docs before writing imports — compound part
naming is exactly the level that shifts between majors.

## Props API sketch

```tsx
type ProgressProps = ComponentPropsWithRef<'div'> & {
  value?: number;                  // present → determinate; absent → indeterminate. That's the API.
  max?: number;                    // default 100; min is 0, not configurable — nobody has a real min
  showValue?: boolean;             // optional "68%" text; layout rules below
} & ({ label: string } | { 'aria-label': string });   // a nameless progressbar is a WCAG failure — the type says so
```

One component, not `<Progress>` + `<IndeterminateProgress>`: real tasks change mode mid-flight
(see below), and two components would force an unmount/remount exactly at the switch.

## ARIA and the mode switch

`role="progressbar"` with `aria-valuemin`/`aria-valuemax`/`aria-valuenow` when determinate.
When indeterminate, **omit `aria-valuenow` entirely** — its absence is precisely how assistive
tech knows the bar is indeterminate; `aria-valuenow="0"` instead announces "0%", which reads as
a stalled task.

**Indeterminate → determinate mid-task is fine** — "connecting… → 12%" is the normal shape of an
upload whose total became known, and it must not remount the element (screen readers would drop
the live context). **Never the reverse.** A bar that showed 60% and then dissolves into an
endless sweep tells the user their progress was lost; if the total genuinely becomes unknown,
hold the last determinate value.

## The percentage text

`showValue` renders "68%", and its position must be stable: `font-variant-numeric: tabular-nums`
so 1→7 doesn't wiggle, plus reserved width for the widest case ("100%") so 9%→10%→100% never
reflows the row. A percentage that shoves the layout on every tick is worse than no percentage.
Use `type.caption` in `color.fg.muted`; the bar carries the information, the digits annotate it.

## When a Progress is really a Spinner

No meaningful total — "saving", "signing in", any task you cannot measure — is Spinner's job.
An indeterminate Progress *bar* earns its place in exactly two situations: the bar is already
where determinate progress will appear moments later (the mid-task switch above), or the
context conventionally expects a bar (a page-top route-loading bar). An indeterminate bar
floating alone in a card is a Spinner wearing a bar costume, with worse geometry.

## Tokens consumed

Track: `color.bg.subtle` (on sunken surfaces use `color.bg.sunken`'s neighbour a step darker so
it stays visible), height `space.1` (4px — thick enough to see, thin enough to not be a Card),
`radius.full` on both track and indicator. Indicator: `color.bg.accent` — success/danger
recolouring is a tone the *surrounding* UI carries (a Banner on failure), not a bar variant to
start with. Motion: animate indicator width with `duration.normal` + `easing.standard` so value
jumps (12% → 40%) glide instead of teleporting; the indeterminate sweep period, like Spinner's
rotation, lives outside `duration.*` as a component custom property (~1.5s). Reduced motion:
determinate width changes may snap (they are data, not decoration); slow the indeterminate
sweep rather than freezing it — a frozen sweep looks like a stall, Spinner's exact argument.

## Test contract, beyond the generic suite

- Determinate: `aria-valuenow`/`min`/`max` present and correct; `value` clamped to `[0, max]`
  (a 104% upload is an arithmetic bug upstream — render 100, don't overflow the track).
- Indeterminate: `aria-valuenow` **absent** — the assertion that catches the "0%" regression.
- Mode switch: rerender from `value={undefined}` to `value={30}` keeps the same DOM node
  (assert identity), gains `aria-valuenow`.
- Accessible name: present via `label` or `aria-label`; type-level expect-error test that the
  nameless call does not compile.
- `showValue`: container width identical at `value={9}` and `value={100}` — the no-reflow rule
  as an assertion, not a hope.

## Meta seeds (do/don't)

- **Do** use Progress when a total exists or will exist. **Don't** use an indeterminate bar for
  an unmeasurable wait — that is Spinner's job; a bar promises a fill it can never deliver.
- **Do** switch indeterminate → determinate as the total becomes known. **Don't** ever go the
  other way — dissolving 60% into a sweep tells the user their progress evaporated.
- **Do** pair the bar with text of what is happening ("Uploading 3 of 5…"). **Don't** rely on
  percentage alone — 68% of *what* is the first thing a user asks a silent bar.
- **Do** keep 100% visible briefly before removing the bar. **Don't** yank it at 99.8% — users
  watch the end of a progress bar; finishing off-screen reads as a failure.
