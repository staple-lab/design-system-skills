# Card

Wave 2 · genuinely custom everywhere · the system's composition surface: named slots, no state.

## No primitive — why

A Card has no behaviour to abstract — it is a surface (background, radius, elevation, padding)
plus an arrangement contract. The value is entirely in the parts being *named*: once `Card.Header`
and `Card.Footer` exist, a hundred feature cards stop inventing their own internal spacing.

## Props API sketch

```tsx
<Card variant="raised">          {/* 'raised' | 'outlined' */}
  <Card.Media>…</Card.Media>     {/* bleeds to the edges — see below */}
  <Card.Header>…</Card.Header>
  <Card.Body>…</Card.Body>
  <Card.Footer>…</Card.Footer>
</Card>
```

Compound parts, not `header=`/`footer=` props: arrangement varies (media above or absent, footer
sometimes a toolbar), and per the component-api-design rule, three `ReactNode` props is a compound
component in disguise. Every part is optional and reorderable; `Card` alone with children is valid.
The root is a `<div>` (or `<article>` via `render`/`asChild` when the card is a self-contained item
in a feed) — never a `<button>` or `<a>`.

## The whole-card-clickable problem

The wrong answers, in the order people reach for them: `onClick` on the div (not focusable, no
role, no keyboard, invisible to assistive tech); wrapping the card in an `<a>` (the accessible
name becomes the card's *entire text content* — heading, body, timestamp, all read as one link —
and the first Button inside it creates nested interactive elements, which is invalid HTML and
unpredictable in screen readers).

The correct answer is the **stretched pseudo-element**: exactly one real link or button inside
(usually the heading), `position: relative` on the card root, and on that link
`&::after { position: absolute; inset: 0 }`. One tab stop, the accessible name is the heading,
the whole surface is clickable. Two costs to state honestly: any *secondary* action inside the
card needs `position: relative` + a higher `z-index` to stay clickable above the overlay, and
text inside the card can no longer be drag-selected (the overlay eats the mousedown). If users
genuinely need to copy card text, keep the link confined to the heading instead.

## Elevation: raised vs outlined

Pick a system default deliberately. `raised` (`color.bg.surface` + `shadow.raised`) separates
from the page without adding line weight, but shadows nearly vanish on dark themes (a dark
surface can't cast a visibly darker shadow — dark themes separate by *lightness*, which is why
`color.bg.surface` must sit a step above `color.bg.default` there) and stack noisily on tinted
backgrounds. `outlined` (`color.bg.surface` + `border: 1px color.border.subtle`) survives every
theme and prints, but a dense grid of bordered cards reads as a spreadsheet. Default to one,
ship the other as the `variant` — do not let product teams mix them within a view.

## Tokens consumed

`card.padding` (component tier, defaults to `space.6`) and `card.radius` (→ `radius.lg`) — the
component tokens exist because **density re-values them**: the compact theme retunes
`card.padding` in one place without touching the `space.*` scale that every other component
shares. Consume the component token, never `space.6` directly, or compact mode silently misses
the card. Surface: `color.bg.surface`, `shadow.raised` or `color.border.subtle`. Internal rhythm:
`space.4` between parts. `Card.Media` bleeds to the edge with negative `card.padding` margins,
and its corner radius must be `card.radius` minus the padding it has escaped — the nested-radii
rule from the token file; reusing the outer radius on the inner image looks visibly wrong.

## Test contract, beyond the generic suite

- Root renders with no `role`, no `tabindex`, no click handler — a Card is not a control.
- Stretched-link recipe (test it as a story/fixture, it is the pattern people will copy): exactly
  one tab stop; the accessible name is the heading text, not the concatenated card; a click on
  the card body activates the link; a secondary Button inside still receives its own click.
- Parts render in DOM order given, each optional; `card.padding` var present so the density
  theme's re-valuation reaches it (assert the custom property, not a pixel).
- Axe on both variants in both themes — `outlined`'s `border.subtle` is decorative, so it is
  allowed below 3:1, but the *content* pairs inside must still pass.

## Meta seeds (do/don't)

- **Do** make a clickable card with one stretched link on the heading. **Don't** put `onClick`
  on the card div or wrap the card in an anchor — the first is keyboard-invisible, the second
  reads its entire contents as the link name and breaks the first nested button.
- **Do** use the parts for internal spacing. **Don't** hand-space with margins inside a card —
  that spacing is exactly what density mode needs to retune, and it can't reach your margins.
- **Do** keep one variant per view. **Don't** mix raised and outlined cards in the same grid —
  elevation is relative, and mixing it reads as a hierarchy you didn't intend.
- **Do** reach for Dialog or Popover when content must float above the page. **Don't** z-index a
  Card into an overlay — it has no focus management, no dismissal, no scrim, and never will.
