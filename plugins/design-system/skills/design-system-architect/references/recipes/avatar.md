# Avatar

Wave 2 · primitive-backed in all three layers. The behaviour being bought is small but easy to
get wrong: the image load/error state machine and not flashing the fallback on a fast network.

## Primitive mapping

| Layer | Ships it as | The work left for you |
|---|---|---|
| Base UI | `Avatar` compound in `@base-ui/react` | Styling, sizes, the initials derivation. Image state handling is bought. |
| Radix | `@radix-ui/react-avatar` | Same. Its fallback part takes a delay — use it (~600ms) so initials never flash before a cached image paints. |
| React Aria | `react-aria-components` | Check the installed version for a dedicated avatar; if it lacks one, the load/error state machine is the *only* behaviour to own (~20 lines: `onLoad`/`onError` → status) — everything else in this recipe still applies. |

Verify part names against the installed version's docs before writing imports — compound part
naming is exactly the level that shifts between majors.

## Props API sketch

```tsx
interface AvatarProps extends ComponentPropsWithRef<'span'> {
  src?: string;
  name: string;                    // required even with src — it feeds initials AND alt
  alt?: string;                    // '' when decorative (default) — see the alt rule below
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';   // fixed scale: 24/32/40/48/64px; md aligns with control.height.md
}
```

Sizes are a fixed scale, not a `number` prop — avatars appear in rows and stacks, and one
27px avatar next to 32px ones is the drift the scale exists to prevent. `md` = 40px so an
avatar sits flush beside a default Button or TextField without anyone measuring.

## The fallback chain

Image → initials → generic person icon, in strict order. Initials render when `src` is absent
or errors; the icon only when `name` is also empty (a system account, a pending invite). Never
skip straight to the icon when a name exists — initials carry identity, the icon carries none.
Never stack real text (a name, a status) *inside* the avatar; it is an icon-sized identity mark,
and text belongs beside it where it can wrap and be selected.

**Initials derivation:** first grapheme of the first word + first grapheme of the last word,
uppercased with `toLocaleUpperCase()`. Use `Intl.Segmenter` (granularity `'grapheme'`) rather
than `name[0]` — `[0]` splits surrogate pairs, so "😀 Test" or "Đặng" yields garbage. One word →
one grapheme. Locale caveat to document, not solve: "first + last" is a Western-order assumption;
for CJK names family-name-first order and single-character surnames mean derived initials can be
wrong or meaningless — accept an explicit `initials`-style override rather than guessing locale.

## The alt rule

Two cases, and the wrong choice produces either silence or stutter:

- **Decorative** (avatar sits next to the visible name — a comment row, a member list): `alt=""`.
  A screen reader then skips it; with `alt={name}` every row reads the name twice.
- **Meaningful** (the avatar stands alone — an overlap stack, the account button in the header):
  `alt` = the person's name. In a stack, that is the *only* place the identity exists.

Default `alt` to `''` — the decorative case is the common one — and make the standalone case
opt in with `alt={name}`. On the initials/icon fallback the same rule applies via `aria-label`
or sr-only text; standalone initials "JD" without a label are anonymous to a screen reader.

## Tokens consumed

`radius.full`. Fallback surface: `color.bg.subtle` with `color.fg.muted` initials — neutral by
default; if you offer deterministic per-user tints, derive them from the accent/semantic ramps,
not a hashed hex. Initials size ≈ 40% of the container (16px at `md`), `font.weight.medium`.
Stacks: a 2px ring of `color.bg.surface` (the ring is the *page* colour, faking a gap) and
negative `space.2` overlap. No motion tokens — an avatar that animates in is noise in a list.

## Test contract, beyond the generic suite

- Error path: `src` set, fire the image's `error` event (jsdom never loads images, so drive the
  event by hand) → initials render. No `name` either → icon renders with the provided label.
- Initials: "Ada Lovelace" → "AL"; "Cher" → "C"; a name starting with an emoji or a combining
  accent yields one whole grapheme, not a broken surrogate half.
- Decorative default: rendered `<img>` has `alt=""` and is absent from the accessibility tree;
  with `alt={name}` it is present with exactly that name.
- Fallback delay: initials do not appear before the delay elapses while the image is pending —
  assert with fake timers; this is the no-flash behaviour the primitive was chosen for.

## Meta seeds (do/don't)

- **Do** pass `alt=""` when the name is visible beside the avatar. **Don't** default to
  `alt={name}` everywhere — a member list then announces every name twice.
- **Do** give standalone avatars (stacks, the header account button) the person's name as their
  accessible name. **Don't** ship an avatar-only button whose name is "image".
- **Do** use the fixed size scale. **Don't** take arbitrary pixel sizes — mixed-size avatars in
  one row are exactly the drift a system exists to stop.
- **Do** cap overlap stacks and end with a "+4" overflow item (that item is a Badge-like count,
  and if it opens a list it is a Button). **Don't** render fifteen overlapping avatars — beyond
  ~5 they are unreadable and the DOM cost buys nothing.
