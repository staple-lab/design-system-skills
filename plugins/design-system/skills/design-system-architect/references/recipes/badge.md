# Badge

Wave 2 · genuinely custom everywhere · the first pure-presentation component. It exists to prove
the variant/token grammar with zero behaviour in the way: if Badge needs anything beyond tokens
and a `<span>`, the token layer has a gap — fix the tokens, not the Badge.

## No primitive — why

There is no behaviour to buy. A Badge is a `<span>` with a tone, a radius and a type style. It is
**never focusable and never clickable**: no `tabIndex`, no `onClick`, no `role`. A "clickable
badge" is a small Button (probably `size="sm"` + a pill radius) — route people to Button rather
than growing an interactive mode here, because the moment a Badge can be clicked it owes focus
rings, keyboard activation and an accessible name, and you have rebuilt Button with none of its tests.

## Props API sketch

```tsx
type BadgeProps = ComponentPropsWithRef<'span'> & {
  tone?: 'neutral' | 'info' | 'success' | 'warning' | 'danger';  // neutral default — same set Banner uses
} & (
  | { children: ReactNode }
  | { dot: true; label: string }   // dot-only: sr-only text required by the type, like icon-only Button
);
```

The tone set mirrors Banner's exactly (`info`/`success`/`warning`/`danger` + `neutral`) so the
status vocabulary is learned once. No `size` prop to start: a Badge sits inline with text and
sizes from its own type style, not from `control.height.*` — it is not a control. Add `size`
only when a real density case demands it, not speculatively.

Count overflow is the caller formatting `count > 99 ? '99+' : count`, but the recipe's styling
must survive it: `min-width` equal to the height so a single digit renders a circle, and the cap
is what keeps a four-digit count from blowing out a nav item's layout.

## Colour is not the message

A tone-only Badge fails WCAG 1.4.1 for the ~4% of users with colour-vision deficiency: red and
green `danger`/`success` dots are identical to them. Every Badge carries text or an icon that
says what the colour says ("Failed", a warning triangle). The dot-only form is the extreme case —
visually just a coloured circle — which is why its variant makes the sr-only `label` mandatory in
the type: `<Badge dot label="3 unread notifications" />` renders a dot plus hidden text.

## Tokens consumed

Subtle-tint pairs, never solid fills: `color.bg.accent-subtle` + `color.fg.accent` (info),
`color.bg.success-subtle` + `color.fg.success`, `color.bg.warning-subtle` + `color.fg.warning`,
`color.bg.danger-subtle` + `color.fg.danger`, and `color.bg.subtle` + `color.fg.default` for
neutral. These pairs are contrast-gated in the token build — a Badge that invents its own hex
pair opts out of that gate. Shape: `radius.full`, padding `space.1` vertical × `space.2`
horizontal, `type.caption` with `font.weight.medium`. No motion tokens: nothing here animates.

## Test contract, beyond the generic suite

- Renders a `<span>`; no `tabindex`, no `role`, no click handler in the DOM even when a caller
  passes `onClick` through `...rest` — decide and assert whether you strip it or let it through
  silently (stripping is kinder; an onClick on a span is always a mistake).
- Axe across **every tone on both themes** — the subtle-tint pairs are exactly where dark-theme
  contrast regressions land first.
- Dot form: the `label` text is in the accessibility tree, the dot itself is `aria-hidden`.
- Type-level: `<Badge dot />` without `label` must not compile (expect-error test).

## Meta seeds (do/don't)

- **Do** use for status a user scans but never operates: "Beta", "Failed", an unread count.
  **Don't** make it clickable — a clickable badge is a small Button; use one, so it gets focus
  and keyboard behaviour for free.
- **Do** pair every tone with text or an icon that carries the same meaning. **Don't** let colour
  be the only signal — red and green are the same colour to deuteranopic users.
- **Do** cap counts at "99+". **Don't** render raw counts — "12,847" turns a pill into a banner
  and misaligns every list row that contains one.
- **Do** use `tone="neutral"` as the default and escalate deliberately. **Don't** decorate with
  semantic tones — a page of orange and red badges has no alarm left when something is actually wrong.
