# Table

Wave 3 · genuinely custom on two of three layers · the boundary decision IS the recipe.
A reference template exists at `${CLAUDE_PLUGIN_ROOT}/templates/components/Table/`
(dependency-free, Tailwind and CSS Modules forms) — adapt it rather than starting blank.

## The boundary: render + a11y in the DS, data logic in userland

The DS Table takes **already-sorted rows**, a sort descriptor and `onSortChange`. It never
sorts, filters, paginates or fetches. A header click fires `onSortChange({column, direction})`;
the consumer re-sorts and re-renders. The test suite asserts the negative: after a header click,
the DOM row order is *unchanged* until the parent passes new rows. The moment a table sorts, it
next needs per-type comparators, `Intl.Collator`, null placement, a server-side-sort flag and a
row model — a data library's surface grafted onto a styling component, which is exactly how DS
tables become unmaintainable. TanStack Table (`@tanstack/react-table`) is a headless state
engine, not a component, so the two compose instead of competing: TanStack computes, DS renders.

Primitive note: React Aria is the only layer that ships a full `Table` (sorting and selection
wired) — on React Aria, wrap it. On Base UI or Radix there is no behaviour to buy; the
template's ~230 lines are the whole cost.

## Semantic HTML — and a table, not a grid

Real `<table>`/`<thead>`/`<tbody>`/`<th scope="col">`/`<td>`, never a div grid. Screen-reader
table navigation — moving cell-by-cell with the row and column headers announced as context —
is the entire point of the element, and a div grid starts from zero with hand-placed
`role="table/row/columnheader/cell"` where every missed role fails silently. Also deliberately
**not** `role="grid"`: grid is an interactive widget that takes over the arrow keys and demands
a complete roving-cell-focus implementation. Right for spreadsheet-style editing; wrong for
reading data. A plain table leaves the keys to the browser and the screen reader.

## Props API sketch

```tsx
interface SortDescriptor<C extends string = string> { column: C; direction: 'ascending' | 'descending'; }

interface TableProps<C extends string = string> {
  sortDescriptor?: SortDescriptor<C>;            // controlled ONLY — an uncontrolled sort would
  onSortChange?: (d: SortDescriptor<C>) => void; // flip the header arrow while the rows stay put
  selectedKeys?: ReadonlySet<string>;            // selection is controlled AND uncontrolled
  defaultSelectedKeys?: ReadonlySet<string>;
  onSelectionChange?: (keys: ReadonlySet<string>) => void;
  stickyHeader?: boolean;
}
// Parts: Table.Head / .Body / .Row (rowKey) / .HeaderCell (column ⇒ sortable) / .Cell /
//        .SelectAllCell (allKeys) / .SelectCell (aria-label required by the type)
```

## Sorting

- The sortable affordance is a real `<button>` inside the `<th>` — a clickable `<th>` is
  invisible to the keyboard; the button brings focus, Enter/Space and a ring for free.
- `aria-sort="ascending|descending"` on the sorted column's `<th>` **only**. Don't put
  `aria-sort="none"` on every column — one column carries the sort; the rest stay silent.
- Clicks toggle ascending ↔ descending; there is no third "unsorted" click, because unsorted
  means "whatever order the rows arrived in", which the table cannot describe or announce. A
  consumer who needs a reset sets `sortDescriptor` back themselves.

## Selection

- A checkbox column: `SelectAllCell` in the head, `SelectCell` per row. The header checkbox's
  `indeterminate` is a DOM property, not an attribute — set it via a ref.
- `SelectAllCell` takes `allKeys` **from the consumer**. Deliberate: the table never knows the
  data set, so whether "select all" means this page or the whole result set stays a product
  decision made where the data lives — and the header checkbox math needs the full key list.
- Selection is announced by the checkboxes themselves. `aria-selected` is defined for grid
  rows; on a plain table it is unsupported noise. Per-row checkbox labels must name the row
  (`Select Ada Lovelace`) — "Select row" fifty times is fifty identical entries in a
  screen reader's controls list.

## Sticky header and column widths

- `position: sticky; top: 0` on the `<th>` cells, `z-index: var(--ds-z-sticky)`, and each cell
  paints its **own background** — rows slide beneath it. The consumer owns the scroll container
  (`max-height` + `overflow: auto`), like they own the data.
- The border-paint caveat: with `border-collapse: collapse`, borders belong to the *table*, so
  the pinned header sheds its bottom rule at the first scroll. Use `border-collapse: separate;
  border-spacing: 0` and draw rules as per-cell `border-bottom`.
- Widths: `table-layout: auto` measures content but reflows when data replaces skeletons;
  `fixed` plus explicit header widths is stable but truncates. Default to auto and set widths
  on the columns you must control (the checkbox column always gets one).

## Empty and loading states

Loading renders **skeleton rows matching the final row geometry** — same heights, same
columns — per the Spinner/Skeleton decision rule: the shape is known, so show the shape. A
centered spinner erases the headers the user was reading and reflows the page when rows land.
Empty gets the EmptyState composition inside one full-colspan cell, with the header row kept.

## Virtualization is userland

Baking a virtualizer into the DS couples it to a scroll library forever and breaks find-in-page
and screen-reader row enumeration for *every* table, including the twenty-row ones. Plain DOM is
fine to roughly ~200 rows; past that, the consumer brings `@tanstack/react-virtual` or similar
and must add `aria-rowcount`/`aria-rowindex`, because the DOM no longer contains the table.

## Test contract, beyond the generic suite

- The negative sort assertion above: click header → `onSortChange` fired, DOM order unchanged.
- `aria-sort` present on exactly one `<th>`; flips with direction; absent when unsorted.
- Selection: toggle, select-all, deselect-all, and `indeterminate === true` at partial.
- Controlled/uncontrolled selection parity; `onSelectionChange` fires in both modes.
- Tab order: sort buttons and checkboxes in reading order; nothing else focusable.
- Axe on a populated table with a selected row and the sort applied.
- Sticky: header cells keep an opaque background — a VRT assertion; a unit test cannot see
  rows ghosting through a transparent pinned header.

## Meta seeds (do/don't)

- **Do** pass sorted rows + the descriptor. **Don't** expect the table to sort or fetch.
- **Do** compose the parts over real table elements. **Don't** build a div grid.
- **Don't** use a table for key-value pairs (that is a description list) or for layout.
- **Do** skeleton rows while loading. **Don't** swap the table for a spinner.
