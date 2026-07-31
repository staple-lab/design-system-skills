# Breadcrumbs

Wave 3 · primitive-backed in one layer only. React Aria ships `Breadcrumbs`/`Breadcrumb` in
`react-aria-components` (link semantics, disabled trail handling) — use it there. Base UI and
Radix ship nothing, and rightly: there is almost no behaviour to buy. Everywhere else this is a
composition of Link (or Button-as-anchor), Icon and — for deep paths — Menu.

## Structure (the semantics are the component)

```tsx
<nav aria-label="Breadcrumb">          {/* singular — the ARIA Authoring Practices name; screen */}
  <ol>                                 {/* readers already append "navigation" */}
    <li><a href="/projects">Projects</a><Icon aria-hidden name="chevron-right" /></li>
    <li><a href="/projects/apollo">Apollo</a><Icon aria-hidden name="chevron-right" /></li>
    <li><span aria-current="page">Settings</span></li>
  </ol>
</nav>
```

Three rules, all falsifiable in tests:

- **Ordered list**, because the order *is* the meaning — a screen reader announces "list, 3
  items" and the user knows the depth before reading a word.
- **The current item is text, not a link**, with `aria-current="page"`. A self-link is a lie
  ("this goes somewhere") that reloads the page when believed. `aria-current` goes on the
  `<span>`, and it is also the styling selector — no `.active` class to drift.
- **Separators are `aria-hidden`** — CSS `content` or an aria-hidden Icon, never a text node.
  A literal `/` or `>` in the DOM reads as "Projects slash Apollo greater Settings". If the
  separator is CSS `content`, it is invisible to the accessibility tree for free; an Icon needs
  the explicit `aria-hidden`.

## Props API sketch

```tsx
interface BreadcrumbsProps {
  items?: { label: string; href: string }[];   // data prop — defensible HERE, see below
  children?: ReactNode;                        // ...or <Breadcrumbs.Item href>, for the exceptions
  maxItems?: 4;                                // beyond this, the middle collapses into a Menu
  renderLink?: (item) => ReactNode;            // router integration — or the system's polymorphism convention
}
```

Select's recipe argues hard against `options={[...]}` arrays; breadcrumbs is the counter-case
worth stating. Items here are homogeneous `{label, href}` pairs that almost always come straight
from route data, so a data prop matches the call site (`items={route.ancestors}`) and lets the
component own truncation. The cost is real though: the first item that needs an icon, a badge, or
a sibling-switcher dropdown forces either a `renderItem` escape hatch or the children form. Ship
the data prop as primary and keep `Breadcrumbs.Item` for the exceptions — implemented so the data
prop renders *through* the Item part, or the two forms drift.

## Truncation (reuses the Menu recipe)

More than 4 levels → render the first item, an ellipsis, then the last two. The ellipsis is a
**real focusable button** — `<Button variant="ghost" aria-label="Show hidden navigation levels">`
opening a Menu containing the collapsed items as links. It hides real destinations, so it cannot
be a decorative `…` span (Pagination's ellipsis is presentational for exactly the opposite
reason: its skipped pages stay reachable elsewhere). Keyboard comes free from Menu's contract:
Enter/Space/ArrowDown opens, arrows navigate, Escape returns focus to the ellipsis button.

Mobile: the trail rarely fits. Two honest options — **parent-only** (render just
`← Apollo`, the immediate parent): loses jump-to-root but matches platform back-affordance
conventions and thumb reach. **Horizontal scroll** on the full trail: keeps every level but hides
most of them off-screen and competes with edge-swipe gestures. Parent-only is the better default;
scroll suits shallow (≤3-level) hierarchies. Pick one per system, not per page.

## Tokens consumed

`type.body-sm` throughout. Links: `color.fg.muted` → `color.fg.default` on hover, underline on
hover only. Current item: `color.fg.default` + `font.weight.medium` via `[aria-current="page"]`.
Separators: `color.fg.subtle`, `space.2` gap either side. Ellipsis button and focus ring come
from Button (`focus.ring-width`, `color.ring`, `radius.sm`); the collapsed Menu brings Dialog's
surface tokens with it.

## Test contract, beyond the generic suite

- `<nav>` accessible name is exactly "Breadcrumb" (singular), and it contains a list whose item
  count equals the visible levels.
- The last item has `aria-current="page"` and **no** link role; every other item is a link.
- No separator text reaches the accessibility tree: assert the accessible names of the list items
  contain no `/`, `>` or chevron characters.
- 6 levels with `maxItems={4}` → first + ellipsis button + last two visible; opening the menu
  shows the 3 hidden levels as links; Escape restores focus to the ellipsis button.
- Axe with the overflow menu open — closed passes trivially.

## Meta seeds (do/don't)

- **Do** reflect the *hierarchy* (where this page lives). **Don't** reflect history (where the
  user has been) — that is the back button, and a history trail changes shape per visit, so it
  cannot be learned.
- **Do** render the current page as plain text with `aria-current`. **Don't** make it a link —
  a self-link reloads the page and announces a destination that is not one.
- **Do** hide breadcrumbs at depth 1 — a trail of one item is a page title wearing the wrong
  landmark. **Don't** render an empty or single-item `<nav>`.
- **Do** put the separator in CSS or an aria-hidden Icon. **Don't** type `/` between links — it
  is announced, and it gets selected when users copy the trail.
