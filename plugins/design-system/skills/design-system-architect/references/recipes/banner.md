# Banner

Wave 3 · no primitive in any layer — genuinely custom, pure token + composition work · inherits
Toast's variant vocabulary (info/success/warning/danger, same semantic tokens) made inline and
persistent. Some systems name it Alert; pick one and put the other in `synonyms`.

## Primitive mapping

| Layer | Ships it as | The work left for you |
|---|---|---|
| Base UI | — nothing to wrap | Everything — but there is no behaviour to buy. A Banner is a styled region, an Icon, text and an optional Button; the whole job is tokens and the role logic below. |
| Radix | — | Same. |
| React Aria | — | Same. |

No part names to verify, for once. The discipline is not imports, it is semantics: get the `role`
logic right and resist the urge to make everything dismissible.

## Props API sketch

```tsx
interface BannerProps {
  variant: 'info' | 'success' | 'warning' | 'danger';   // required — a banner has no neutral default
  title?: ReactNode;
  children: ReactNode;
  /**
   * Rendered-with-the-page (default) vs appeared-after-an-action. Controls the role — see below.
   * A banner in the initial HTML must NOT be a live region.
   */
  live?: boolean;                                       // default false
  action?: ReactNode;                                   // one Button/link toward resolving the state
  onDismiss?: () => void;                               // presence renders the close button; absence is deliberate
}
```

**The role depends on when it appears, not what it is.** A banner rendered with the page is *not* a
live region — screen readers meet it in document order like any content, and `role="alert"` on
initial render either announces nothing or announces spuriously, depending on the browser. A banner
that appears *after* an action ("payment failed", "settings saved") is a live region: `role="status"`
for info/success/warning, `role="alert"` only for danger. That is Toast's politeness rule, keyed
off `live` + `variant`.

**Dismissibility is optional, and persistence is legitimate.** `onDismiss` renders the close button;
omitting it is not a missing feature. A "payment failed — update your card" banner should not be
dismissible into nothing: the banner *is* the visible form of an unresolved state, and it leaves
when the state resolves, not when the user tires of it. Give persistent banners an `action` toward
resolution instead of an X. Dismissible is right when the content is ignorable — announcements,
tips, "what's new".

**Banner vs Toast — the decision rule.** Transient confirmation of something that just worked →
Toast (disappears, fine). State the user must resolve, or keep seeing until it changes → Banner
(persists, findable after the fact, in the page's reading and tab order). If you are extending a
toast's timeout so people don't miss it, it was a banner all along.

## States (style from these, never from React state)

`data-variant` only — a banner has no open/closed lifecycle; it is in the tree or it is not. If
dismissal animates out, collapse via `grid-template-rows 1fr → 0fr` plus a fade (Accordion's
technique), then unmount — the content below sliding up smoothly is the point of animating it.

## Tokens consumed

Per-variant surface: `color.bg.{accent,success,warning,danger}-subtle`, with the matching
`color.fg.{accent,success,warning,danger}` on the **icon and edge only**. Body text stays
`color.fg.default` / `color.fg.muted` — tinted text on a tinted surface is where 4.5:1 quietly
dies, and the token contrast gate only checks the pairs you actually use. Layout: `space.3`/`space.4`
padding, `radius.md` (sharp full-bleed at page top is also fine — then no radius at all),
`type.body-sm`, `type.label` for the title. Dismiss/action buttons: `focus.ring-width` +
`color.ring`, `:focus-visible` only. No `z.*`, no `shadow.*` — a banner sits *in* the page;
elevation and stacking are Toast's.

## Keyboard map (the test contract asserts every row)

| Keys | Where | Action |
|---|---|---|
| `Tab` | page | Reaches the banner's action, then its dismiss button, in reading order — no shortcut needed; the banner is in the page |
| `Enter` / `Space` | action / dismiss | Activates it |
| *(none)* | on appear | Even a `live` banner never moves focus; announcement is the live region's job |

## Test contract, beyond the generic suite

- Role logic, all three cases: initial render → no `status`/`alert` role in the tree; `live` +
  success → `role="status"`; `live` + danger → `role="alert"`.
- Variant is not colour-alone: it is discernible from text — an sr-only "Warning:" prefix or
  explicit copy — and the variant icon is `aria-hidden` (redundant with that text). Assert the
  accessible text, not the icon.
- Dismiss: `onDismiss` fires; if focus was on the dismiss button, focus lands somewhere sane
  afterwards (next focusable or the region's container), not on `<body>` — the dropped-focus bug
  every removable element has until tested.
- No `onDismiss` → no close button in the tree (not a hidden or disabled one).
- Axe on all four variants in both themes — the tinted surfaces are exactly where contrast breaks.

## Meta seeds (do/don't)

- **Do** use for state the user must resolve or keep seeing — payment failed, plan limit reached,
  service degraded. **Don't** use for transient confirmations; "Saved" that persists all afternoon
  reads as a stuck page. That's Toast.
- **Do** make ignorable banners dismissible. **Don't** make "payment failed" dismissible into
  nothing — pair persistent banners with an `action` that resolves the state instead.
- **Do** render page-level banners at the top of the content, in the page flow. **Don't** portal or
  float them — overlay positioning, stacking and timers are Toast's contract, and a floating
  banner is a toast that never leaves.
- **Do** aggregate: one banner summarising three problems. **Don't** stack three banners — by the
  third, the page has no content above the fold and users dismiss them unread as a set.
