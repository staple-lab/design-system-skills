# Pagination

Wave 3 · no primitive in any layer — pure composition of Button + Icon. The roadmap calls it
"almost free by now"; this recipe proves the claim by listing what is bought versus built.

## Composition (replaces the primitive mapping)

**Reused, zero new work:** Button (`ghost` variant for pages, its sizes, focus ring, disabled
semantics, ≥44px tap target), Icon (chevron prev/next, the icon-only `aria-label` constraint the
Button types already enforce), Inline for the row. **Actually new:** the `<nav>` wrapper, the
window algorithm, and `aria-current`. That is the entire component — if it grows beyond ~100
lines, something is being rebuilt that Button already owns.

## Props API sketch

```tsx
interface PaginationProps {
  page: number;                      // controlled ONLY — no defaultPage, deliberately
  onPageChange: (page: number) => void;
  pageCount: number;                 // total pages, not total items — item math is the caller's
  siblingCount?: 1;                  // pages shown either side of current; 1 → the 7-slot window
  startSlot?: ReactNode; endSlot?: ReactNode;  // "1–20 of 312", per-page selector — slots, not props
}
```

Controlled only, and this is the rare component where offering `defaultPage` would be a bug:
page state lives in the data layer (the query, usually the URL). An uncontrolled pagination that
tracks its own page renders "page 3" while the table still shows page 1's rows — the control and
the data disagree, and the component is lying. Items-per-page and "312 results" displays are
slots because they are data-layer concerns too: building them in means building in the fetch.

## The window algorithm (state it, don't improvise it)

Seven visible slots, always — a fixed count so the row never changes width as the user moves.
First and last page are always rendered; ellipses fill the gaps; ellipses are
`<span aria-hidden="true">` — presentational, not buttons (Breadcrumbs' ellipsis is a button
because it reveals hidden *destinations*; skipped page numbers are still reachable via next/prev).

- `pageCount ≤ 7` → all pages, no ellipsis.
- `page ≤ 4` → `1 2 3 4 5 … N`
- `page ≥ pageCount − 3` → `1 … N-4 N-3 N-2 N-1 N`
- otherwise → `1 … page-1 page page+1 … N`

Write it as a pure function returning `(number | 'ellipsis')[]` and unit-test it directly — it is
the only logic in the component.

## States (style from these)

The current page is styled from `[aria-current="page"]` — no `data-active`, no `.active` class.
The attribute the screen reader needs is the selector; they cannot drift apart. Everything else
(`data-disabled`, focus ring, hover) is Button's own state surface, untouched.

Prev is `disabled` on page 1, next on the last page — and this is the sanctioned exception to
"never disable without a reason". The reason is fully self-evident from position: there is no
page 0, nothing to explain, no action the user could take to un-disable it. The alternatives are
worse: hiding the button shifts layout and breaks muscle-memory clicking, and an enabled no-op
button announces as actionable and then silently does nothing.

## Tokens consumed

Almost nothing of its own — Button's ghost variant carries `control.height.sm`, `radius.md`,
`color.bg.subtle-hover`, `focus.ring-width`/`color.ring`. Added: `space.1` gap between items,
`type.body-sm` for page numbers, `color.fg.muted` on the ellipsis, and the current page takes
`color.bg.subtle-active` + `font.weight.medium` via the `aria-current` selector.

Keyboard: plain Tab between buttons, Enter/Space activate — deliberately **no roving focus and no
arrow keys**. Arrow-key composites are for widgets (radio groups, menus); this is a `<nav>` of
discrete buttons, and Tab is the contract users expect from it.

## Test contract, beyond the generic suite

- The window function, exhaustively: `pageCount=5` (no ellipsis), `pageCount=20` at pages 1, 4,
  10, 17, 20 — assert the exact slot array, and that its length is 7 in every ellipsis case.
- Exactly one element with `aria-current="page"`, and the `<nav>` has the accessible name
  "Pagination".
- Controlled discipline: clicking page 5 calls `onPageChange(5)`; with a non-updating parent the
  rendered current page must NOT move (the two-sources-of-truth regression).
- Prev disabled at page 1, next at `pageCount`, both enabled everywhere else.
- Ellipsis is absent from the accessibility tree (no button role, no announced "…").

## Meta seeds (do/don't)

- **Do** keep the page in the URL (`?page=3`) and pass it down. **Don't** hold it in a local
  `useState` — refresh, back button and shared links all land on page 1 and the user's place is lost.
- **Do** use for finite, jumpable datasets (tables, search results). **Don't** paginate a feed —
  pagination promises "jump to page 9" and "how much is there"; a feed keeps neither promise, use
  load-more or infinite scroll.
- **Do** render prev/next disabled at the boundaries. **Don't** hide them — the row reflows and
  the click target the user was aiming at moves under their cursor.
- **Do** pass "1–20 of 312" and the page-size selector through `startSlot`/`endSlot`. **Don't**
  build them in — both need the data layer's counts, and a component that fetches is no longer a
  pagination control.
