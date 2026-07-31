# Navigation (side nav + top bar)

Wave 3, deliberately last — the biggest composition surface in the system, and it consumes half
the library above it: Icon, Button, Tooltip (collapsed-rail labels), Badge (counts), Avatar
(account), Menu (overflow, account menu), Accordion's disclosure grammar (sections), and Dialog
(the mobile drawer). Building it earlier means building those pieces twice.

## Primitive mapping

Mostly none — the shell is composition. The one bought part: Radix and Base UI ship a
**NavigationMenu** primitive (per the roadmap; React Aria does not) for the top bar's
hover-intent dropdown panels — the "Products ▾" mega-menu pattern with its open-delay and
pointer-grace handling, which is genuinely hard and worth buying. Everything else — the side
rail, sections, collapse, drawer — has no primitive in any layer because it is links, landmarks
and reuse. Do **not** reach for `role="menu"` primitives (Menu, Menubar) for site navigation:
`menu` is the action-menu role with an arrow-key/single-tab-stop interaction model; a screen
reader user landing in one expects Windows-95 menu behaviour, not a list of links.

## Landmark structure (the part that cannot be styled into existence)

- Each region is a `<nav>` with a **distinct** `aria-label`: "Primary" (side), "Global" (top
  bar). Two unlabeled navs are announced identically — indistinguishable in a landmark list.
- Exactly **one** `<main>` on the page. The nav component cannot render it, but its docs and
  test contract must demand it, because the skip link below targets it.
- **The skip link is a requirement, not a nicety**: the first tab stop on the page, an anchor to
  `#main`, visually hidden until focused and fully visible on focus. A side nav with 25 links
  otherwise costs a keyboard user 25 Tab presses on *every page load*. Hiding it with
  `display:none` removes it from tab order entirely — hide it off-screen/clipped instead.

## Structure and reuse

```tsx
<SideNav aria-label="Primary" collapsed={collapsed}>
  <SideNav.Item href="/projects" icon={<FolderIcon />}>Projects</SideNav.Item>
  <SideNav.Section label="Admin">            {/* Accordion's disclosure grammar */}
    <SideNav.Item href="/admin/members">Members</SideNav.Item>
  </SideNav.Section>
</SideNav>
```

- **Current item**: `aria-current="page"` on the active link — set from the router, styled from
  the attribute. Never a `.active` class beside it.
- **Collapsible sections** reuse Accordion's grammar exactly: a header `<button>` with
  `aria-expanded`, `data-state="open|closed"` for styling, chevron rotated by state. Same tokens,
  same motion, same tests — new grammar here means two disclosure behaviours in one product.
- **Collapsed rail** (icons only): each item needs a Tooltip carrying its label, and the item
  keeps its accessible name — the *tooltip* is the visual affordance, the name never left.
- **Overflow** (top bar out of width): excess items move into a Menu — this one *is* an action
  menu ("more items" button), so Menu's role and keyboard contract are correct there.
- **Responsive collapse**: below the breakpoint the side nav becomes a drawer, and a drawer is a
  Dialog variant — portal, focus trap, scroll lock, Escape, focus-return, positioned as an edge
  sheet. Reuse Dialog; a hand-rolled slide-in div reliably ships with none of those five.

**Depth limit: 2 levels** (section → item). At 3+ the fix is information architecture — merge
sections, promote a level to the top bar, or push depth into the page — not a tree widget. A
tree control in a side nav imports `role="tree"`'s full keyboard grammar to solve a problem the
IA created.

## Active-trail vs active-item (decide once)

**Active-item**: only the current leaf gets `aria-current` styling. **Active-trail**: ancestors
get a quieter tint (`data-active-trail` on the section). Trail aids orientation when the section
is collapsed or the nav is deep; at the 2-level cap with the section expanded, the open section
already shows the trail, so the tint is mostly extra visual weight. Default to active-item at
depth ≤2; add the trail only if sections default to collapsed. Either way `aria-current` stays
on exactly one link — the trail is styling, never a second `aria-current`.

## Tokens consumed

Rail: `color.bg.surface` (or `color.bg.sunken` to recede), `color.border.subtle` edge. Items:
`type.body-sm`, `color.fg.muted` → `color.fg.default` + `color.bg.subtle-hover` on hover;
current item `color.bg.accent-subtle` + `color.fg.accent` + `font.weight.medium`; `radius.md`,
`space.2` padding, `control.gap` icon-to-label. Top bar: `z.sticky`, `shadow.raised` once
scrolled. Drawer: Dialog's `z.modal`, `shadow.modal`, `color.bg.overlay`. Motion:
`duration.fast` + `easing.standard` for section collapse and rail width. Widths are component
tokens — add `nav.width` / `nav.width-collapsed` beside the existing `dialog.*` group rather
than hard-coding 240/64px in CSS.

## Keyboard map (the test contract asserts every row)

| Keys | Where | Action |
|---|---|---|
| `Tab` (first press on page) | document | Skip link receives focus and becomes visible |
| `Enter` on skip link | skip link | Focus moves into `<main>`; next Tab continues past the nav |
| `Tab` / `Shift+Tab` | nav | Moves through links and section headers in DOM order — deliberately **no** arrow-key roving; links, not a widget |
| `Enter` / `Space` | section header | Toggles `aria-expanded`; collapsed section's links leave the tab order |
| `Enter` | drawer trigger | Opens drawer, focus moves inside (Dialog's contract) |
| `Escape` | open drawer | Closes, focus returns to the trigger |

## Test contract, beyond the generic suite

- Landmarks: exactly one `main`; every `nav` has a unique accessible name.
- Skip link: first Tab stop, visible when focused (assert it is not clipped/transparent), and
  activating it moves focus into `main`.
- `aria-current="page"` on exactly one link, before and after simulated route change.
- Section toggle: `aria-expanded` flips; links inside a closed section are unreachable by Tab.
- Drawer inherits Dialog's suite *and* runs it here: trap, scroll lock, Escape, focus-return to
  the hamburger. Axe with the drawer open and with a section expanded.
- Collapsed rail: every item still exposes its accessible name; Tooltip appears on focus, not
  only on hover.

## Meta seeds (do/don't)

- **Do** build nav from links + `aria-current`. **Don't** use `role="menu"`/`menuitem` for site
  navigation — that role promises an action-menu keyboard model and strips link affordances
  (open-in-new-tab, copy link) from what are, in fact, links.
- **Do** cap the side nav at 2 levels. **Don't** add a third-level tree — the IA needs work, not
  the nav more features; depth beyond 2 belongs to the page or the top bar.
- **Do** make the drawer a Dialog variant. **Don't** hand-roll a slide-in panel — the rebuilt
  version ships without focus trap, scroll lock, Escape and focus-return, and each is a bug report.
- **Do** ship the skip link, visible on focus. **Don't** `display:none` it or skip it because
  "the nav is short" — it is the first thing every keyboard and screen-reader user meets, on
  every page.
