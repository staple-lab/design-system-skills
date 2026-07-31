# Spinner + Skeleton

Wave 2 · genuinely custom everywhere · one file because they are the two halves of one decision.
Shipping them separately is how a codebase ends up using both at once in the same region.

## No primitive — why

No behaviour to abstract: a Spinner is a rotating SVG with a status role; a Skeleton is an
`aria-hidden` box with a pulse. The entire value is in the decision rule and the announcement
discipline below — which is exactly what a primitive library cannot ship.

## The decision rule

- **Layout of the incoming content is known** → Skeleton, matching the final geometry, so the
  page assembles without a layout shift when content lands.
- **Wait is short or the shape is unknown** → Spinner. A skeleton that guesses the wrong shape
  is worse than a spinner: the "wrong" layout flashing into the real one reads as a bug.
- **Under ~300ms** → nothing. A loading indicator that flashes for 120ms makes the app *feel*
  slower than showing nothing — the user perceives the flash as an extra step. Implement the
  delay in CSS (`opacity: 0` with a 300ms-delayed fade-in on both components) rather than a JS
  timer: no re-render, and unmounting before 300ms means it simply never appeared.
- **Never both in one region.** A card showing a skeleton with a spinner on top announces two
  loading vocabularies for one wait; the region has one owner.

## Props API sketch

```tsx
interface SpinnerProps extends ComponentPropsWithRef<'span'> {
  size?: 'sm' | 'md' | 'lg';       // 16/20/24px — sm matches inline text, md matches control icons
  label?: string;                  // default "Loading" — sr-only, always rendered
}
interface SkeletonProps extends ComponentPropsWithRef<'div'> {
  shape?: 'text' | 'circle' | 'rect';   // text: 1em bar that inherits the local font-size
  width?: string; height?: string;      // tokens/percentages — a skeleton mirrors real layout, so it takes real layout values
}
```

Spinner colour is `currentColor`, not a prop — inside a primary Button it inherits
`color.fg.on-accent` and stays visible with zero wiring, the same trick Button's loading state
relies on.

## Announcements — where teams get this badly wrong

- **Spinner carries the label**: `role="status"` (polite live region) + sr-only text. An
  unlabelled spinner is invisible to a screen-reader user, who is left wondering why the page
  went quiet.
- **Skeletons are `aria-hidden="true"`, every one of them**, and the *region* gets ONE
  `role="status"` announcement ("Loading results"). A page of twelve announcing skeletons is a
  screen-reader disaster — twelve "loading" utterances for one wait. The skeleton is a visual
  metaphor; the announcement belongs to the region, once.
- When content lands, the status text goes away — do not announce "loaded"; the content itself
  arriving is the announcement.

## Reduced motion

Two different answers, per the motion-system rule that "reduced" means less, not none:

- **Skeleton: pulse → static.** The pulse is pure decoration; a static `color.bg.subtle` block
  communicates "placeholder" identically. Kill the animation entirely under
  `prefers-reduced-motion: reduce`.
- **Spinner: keeps rotating, slowed.** A frozen spinner is indistinguishable from a hang — the
  rotation *is* the information. Rotation of a small element rarely triggers vestibular symptoms,
  so it is exempt-ish: keep it, but slow the period (~2× — 0.8s → 1.6s) instead of stopping it.

## Tokens consumed

Skeleton: `color.bg.subtle` pulsing to `color.bg.subtle-hover` (both theme-aware, so dark mode
needs nothing extra); `radius.sm` for text bars, `radius.full` for circles, `radius.md` for
rects. Spinner: `currentColor` stroke, `space.*`-aligned sizes. The loop periods (rotation
≈0.8s, pulse ≈1.6s) deliberately do **not** come from `duration.*` — that scale tops out at
600ms and describes transitions, not continuous loops. Expose them as component-level custom
properties (`--spinner-period`, `--skeleton-period`) so reduced-motion and tests can reach them,
rather than bending the duration scale around two outliers.

## Test contract, beyond the generic suite

- Spinner: `role="status"` present, accessible name equals `label`, default "Loading"; renders
  inside a Button without changing the button's height (the no-reflow loading contract).
- Skeleton: root and every bone `aria-hidden`; a region fixture asserts **exactly one**
  `role="status"` node regardless of bone count — this is the assertion that catches the
  per-skeleton-announcement regression.
- Reduced motion (mock `matchMedia`): skeleton's computed `animation` is `none`; spinner's
  animation persists with the longer period (assert the custom property, not the raw style).
- Delay: neither is visible (opacity 0) before ~300ms after mount; visible after.

## Meta seeds (do/don't)

- **Do** use Skeleton when you know what's coming and Spinner when you don't. **Don't** show a
  skeleton whose shape guesses wrong — the false layout flashing into the real one reads as a
  bug, and a spinner would have been honest.
- **Do** delay both by ~300ms. **Don't** flash a loader for a fast response — the flash makes
  the app read slower than showing nothing at all.
- **Do** hide every skeleton from assistive tech and announce once per region. **Don't** put
  `role="status"` on skeletons — twelve bones is twelve announcements for one wait.
- **Do** switch to Progress when a percentage exists (upload, export). **Don't** leave a spinner
  running through a 40-second job you could measure — an indeterminate wait with a known total
  wastes the one thing that makes long waits bearable.
