# Accordion

Wave 3 · primitive-backed in all three layers · inherits Tabs' one-list-many-panels shape, but with
disclosure semantics instead of selection — every trigger is its own tab stop, nothing roves.

## Primitive mapping

| Layer | Ships it as | The work left for you |
|---|---|---|
| Base UI | `Accordion` compound (Root/Item/Header/Trigger/Panel); multiple-open is a Root-level boolean (`openMultiple`) | Styling, height animation, tokens. The Header renders a heading element with the Trigger button inside — keep that structure. |
| Radix | `@radix-ui/react-accordion` (Root/Item/Header/Trigger/Content); `type="single\|multiple"` plus `collapsible` for single mode | Same. Exposes the measured panel height as a CSS variable (`--radix-accordion-content-height`) for the open/close keyframes. |
| React Aria | `DisclosureGroup` + `Disclosure` + `Button` + `DisclosurePanel` from `react-aria-components`; `allowsMultipleExpanded` | Same, and note the different vocabulary — there is no "Accordion" export; an accordion *is* a DisclosureGroup. |

Verify part and prop names against the installed version's docs before writing imports — the
single/multiple switch is spelled differently in all three layers. The structural invariant to
preserve whatever the layer: **`aria-expanded` lives on a real `<button>` inside a heading element**
(`<h3><button aria-expanded>…</button></h3>`). A clickable heading div fails keyboard users; a
button outside a heading loses screen-reader users navigating by headings; and `aria-expanded` on
the heading instead of the button announces nothing.

## Props API sketch

```tsx
interface AccordionProps {
  type?: 'single' | 'multiple';          // default 'multiple' — see below
  value?: string[]; defaultValue?: string[]; onValueChange?: (value: string[]) => void;
  collapsible?: boolean;                 // single mode only: may the open panel be closed? default true
  children: ReactNode;   // <Accordion.Item value><Accordion.Trigger/><Accordion.Panel/></Accordion.Item>
}
```

**Single vs multiple.** `single` auto-collapses the previous panel, which keeps the page short and
the layout tidy — and silently loses the user's place: the collapse happens *above* their scroll
position, so the page jumps, and a user comparing two answers can never see both at once. `multiple`
makes opening cost nothing and closing explicit. Default `multiple` for content people work with
(FAQs, settings, documentation); `single` is legitimate when panels are long and genuinely mutually
exclusive — a checkout's payment-method sections, where two open panels would be a contradiction.

**Height animation.** Animate `grid-template-rows: 0fr → 1fr` on a wrapper (inner element gets
`min-height: 0; overflow: hidden`), or use the primitive's measured-height CSS variable in a
keyframe. Never `max-height: 500px` guesses: too small clips real content; too large means the
visible motion finishes in the first fifth of the duration — open looks instant, close starts with
a dead delay while the invisible overflow "collapses".

**When NOT to use.** Two items: show both — two headings and two bodies cost less than two clicks.
Navigation: an accordion of links is a nav tree wearing the wrong semantics; use `<nav>`, links and
`aria-current`, not `aria-expanded` disclosure buttons.

## States (style from these, never from React state)

`data-open` on Base UI's Item/Trigger/Panel, `data-state="open|closed"` (Radix), or
`data-expanded` (React Aria) — check which the installed layer emits; a selector that never
matches is silent. Plus `data-disabled`. Rotate the chevron from the open state on the trigger,
not from React.

## Tokens consumed

Trigger: `type.label`, `color.fg.default`, `space.4` block padding, full-width,
`color.bg.subtle-hover` on hover. Focus: `focus.ring-width`, `color.ring`, `focus.ring-offset`,
`:focus-visible` only. Items separated by `color.border.subtle` rules — a border per item, not a
boxed card per item. Panel: `type.body`, `color.fg.muted`, `space.4` bottom padding. Motion:
height with `duration.normal` + `easing.standard`; chevron rotation `duration.fast`.

## Keyboard map (the test contract asserts every row)

| Keys | Where | Action |
|---|---|---|
| `Enter` / `Space` | trigger | Toggles the panel |
| `Tab` / `Shift+Tab` | anywhere | Moves between triggers and any focusables in open panels — every trigger is a stop; this is not Tabs |
| `ArrowDown` / `ArrowUp` | trigger | Next / previous trigger (an APG enhancement all three layers ship — assert it, but Tab must work regardless) |
| `Home` / `End` | trigger | First / last trigger |

## Test contract, beyond the generic suite

- Structure: each trigger is `getByRole('button')` *inside* `getByRole('heading')`, with
  `aria-expanded` toggling on the button and `aria-controls` pointing at the panel.
- `type="single"`: opening B closes A. `type="multiple"`: it does not. `collapsible={false}`:
  activating the open item's trigger leaves it open — assert all three configurations.
- Closed panels are hidden from everyone: content of a closed panel is not reachable by `Tab` and
  not in the accessibility tree (the height animation must end in `hidden`/`display: none`, not
  just zero height — `overflow: hidden` at 0fr still leaves focusables tabbable).
- Controlled with a non-updating parent: clicking a trigger must NOT open the panel.
- Axe with one panel open and one closed in the same render.

## Meta seeds (do/don't)

- **Do** use for scannable reference content where users want one section at a time — FAQs,
  advanced-settings groups. **Don't** use for two items; show both.
- **Do** default `multiple`. **Don't** auto-collapse (`single`) content people compare — the
  collapse above their viewport makes the page jump and loses their place.
- **Don't** use as navigation. An accordion of links is a nav tree with the wrong semantics —
  screen readers offer heading/disclosure navigation for it and link lists for navs.
- **Don't** bury content users must see (pricing caveats, legal terms) in a collapsed panel —
  "it was in the accordion" persuades nobody, including regulators.
