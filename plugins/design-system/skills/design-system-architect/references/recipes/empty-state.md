# EmptyState

Wave 3 · no primitive anywhere — composition of Icon + type + Button, with no behaviour to buy
because there is none. It exists so that empty states are *designed once*: without it, every
table, list and search surface improvises its own "No data" div, and the product's most
common first-run screen is its least considered.

## Composition (replaces the primitive mapping)

Stack (centering + gaps) + Icon (or an illustration slot) + two text slots + one action slot that
callers fill with Button. Nothing here is stateful; the entire value is the enforced shape.

## The three kinds (from the inventory's Patterns page)

Each kind has a different copy shape and a different — single — primary action. Conflating them
is the classic failure: offering "Create project" on a filtered-to-zero list tells the user their
search found nothing because nothing exists, which is false.

| Kind | When | Copy shape | Primary action |
|---|---|---|---|
| `first-use` | The container has never held anything | What this space is for + what the first item gets them | Create the first thing |
| `no-results` | Data exists; the filter/search excluded all of it | Echo the query ("No results for 'invoice-2024'") + how to widen it | Clear filters / edit search |
| `error` | The data could not be loaded | What failed, in the user's terms | Retry |

The falsifiable claim this recipe makes: **good empty-state copy answers three questions — what
is this space, why is it empty, and what do I do next.** "No data" answers zero of the three.
"No projects yet — projects group your team's deployments. Create one to get started" answers
all three. Review empty-state copy against that count, not against taste.

## Props API sketch

```tsx
interface EmptyStateProps {
  kind?: 'first-use' | 'no-results' | 'error';  // selects spacing/tone defaults, documents intent
  icon?: ReactNode;          // decorative — the component wraps it in aria-hidden, always
  title: string;             // required; the type makes a bare "No data" at least a deliberate act
  description?: ReactNode;   // ReactNode: "No results for <b>{query}</b>" must not force a fork
  action?: ReactNode;        // ONE slot — callers pass <Button>; the shape enforces one primary
  secondaryAction?: ReactNode;  // a ghost Button or Link at most
}
```

One primary action, enforced by having exactly one `action` slot rather than an `actions` array.
An empty state with three buttons is a navigation page wearing an empty state's clothes — if
there are genuinely three next steps, the surface needs designing as a page, not filling with a
component. `secondaryAction` exists for the honest pair ("Create project" / "Import instead"),
rendered visually subordinate.

## Slot discipline: the icon is decorative

The component wraps whatever lands in `icon` in a `<div aria-hidden="true">` — unconditionally.
The words carry the meaning; the image is mood. This also means the illustration must not contain
load-bearing text baked into the artwork (untranslatable, invisible to screen readers, blurry at
200% zoom). If an icon "needs" a label, that label belongs in `title`.

## Layout and tokens consumed

Vertically centered in the region it fills (the empty table body, the panel — not the viewport,
unless it owns the viewport), with the text block capped at ~40ch so a wide container does not
stretch two sentences into one unreadable line. Stack gap `space.3` between icon/title/text,
`space.5` before the action; container padding `space.12`. Type: `type.heading-3` +
`font.weight.semibold` for the title, `type.body` + `color.fg.muted` for the description. Icon:
`color.fg.subtle`, sized 2–3× body (visibly an illustration, not an inline glyph); `error` kind
may use `color.fg.danger` on the icon but the description does the explaining. No motion, no
z-index, no keyboard map — the only focusable thing is the caller's Button, which brings its own.

## Test contract, beyond the generic suite

- The `icon` slot's wrapper has `aria-hidden="true"` even when the caller forgets — assert an
  `<svg>` passed in exposes no role or name to the accessibility tree.
- With `action` set, the button is reachable by Tab and its accessible name is the action, not
  "button". With no action, nothing in the component is focusable.
- Renders sensibly with `title` alone — no dangling gaps where absent slots would sit (assert no
  empty styled containers in the DOM).
- At 200% zoom / 320px width the text wraps within its max-width and the action stays visible
  without horizontal scroll.

## Meta seeds (do/don't)

- **Do** write copy that answers: what is this, why is it empty, what next. **Don't** ship
  "No data" / "Nothing here" — zero of the three questions answered; the user's next move is to
  assume the app is broken.
- **Do** match the action to the kind — retry for `error`, clear-filters for `no-results`,
  create for `first-use`. **Don't** offer "Create new" on a filtered list — it claims the data
  doesn't exist when the filter merely hid it.
- **Do** cap it at one primary action (plus one quiet secondary). **Don't** present three
  buttons — that is a navigation page, and the empty state's job is one next step.
- **Do** keep the illustration decorative and text-free. **Don't** put the message in the
  artwork — untranslatable, unannounced, and unreadable at high zoom.
