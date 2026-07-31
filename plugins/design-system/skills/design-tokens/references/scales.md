# Constructing the scales

Recipes with actual numbers. Use them as the starting point, then tune by eye — a scale that measures perfectly and looks wrong is wrong.

---

## Colour ramps in OKLCH

A ramp is 12 steps. Each step has a **job**, and the jobs are what make the ramp usable — a designer picking "step 9" should be picking a role, not a shade.

| Step | Job | L | C (× peak) |
|---|---|---|---|
| 50 | Page-level tint, subtlest wash | 0.977 | 0.07 |
| 100 | Subtle background, hover on subtle | 0.955 | 0.14 |
| 200 | Subtle background, active | 0.925 | 0.26 |
| 300 | Borders, subtle | 0.883 | 0.41 |
| 400 | Borders, strong / disabled fills | 0.820 | 0.61 |
| 500 | Decorative fills, low-emphasis solids | 0.720 | 0.84 |
| **600** | **Solid fill — the brand step.** Primary buttons; white text must clear 4.5:1 | **0.565** | **1.00 (peak)** |
| 700 | Solid hover; link text on light backgrounds | 0.500 | 0.97 |
| 800 | Solid active / pressed | 0.445 | 0.86 |
| 900 | Text on light backgrounds; clears 7:1 vs white | 0.400 | 0.73 |
| 950 | Highest-contrast text; dark-theme surfaces | 0.290 | 0.51 |
| 1000 | Near-black tint of the hue | 0.190 | 0.32 |

These are the values shipped in `templates/tokens/primitive.tokens.json`, and they are *measured*, not guessed: at `L 0.565 C 0.185 H 258` white text lands at **4.66:1**, and at `L 0.600` it lands at 4.03:1 and fails. That 0.035 of lightness is the whole difference between a compliant button and a non-compliant one, which is why the ramp is tuned around step 600 rather than around the middle.

Chroma is expressed relative to the peak because **max chroma varies by hue** — you cannot use the same absolute chroma for yellow and blue and stay in gamut. Yellows and greens peak far lower in chroma at high lightness than blues and purples do, and they are also intrinsically more luminous: at the same OKLCH lightness, green carries ~9% more relative luminance than a neutral and red ~12% less. That is why the green ramp's solid fill lands at step 700 while blue's lands at 600 — the fill step is chosen by contrast, not by position. Clamp to sRGB gamut unless the target is P3-only.

Generating from one brand hex:
1. Convert the brand colour to OKLCH. Its `L` tells you which step it *is* — if `L ≈ 0.62` it is your 600; if it is much lighter, it is a 400 or 500 and the solid fills must be derived darker.
2. Keep `H` constant across the ramp, or shift it deliberately. A small hue shift toward yellow in light steps and toward blue in dark steps mimics how pigment behaves and reads as more natural; keep the total drift under ~15°.
3. Set `L` per the table, scale `C` per the table, clamp to gamut.
4. **Verify contrast, do not assume it.** The lightness targets are calibrated so 600 clears 4.5:1 and 900 clears 7:1 against white, but gamut clamping moves things. Measure.

Ramps a system needs: **neutral** (the workhorse — 70% of the UI), **accent/brand**, **success**, **warning**, **danger**, and optionally **info**. Neutral is the one to get right; a slightly-tinted neutral (chroma 0.005–0.015 pulled toward the brand hue) looks considered where a pure grey looks default.

### Contrast targets

| Pairing | Minimum |
|---|---|
| Body text on background | 4.5:1 (AA) — aim 7:1 (AAA) for long-form |
| Large text (≥18.66px bold / ≥24px) | 3:1 |
| Icons, borders that convey state, focus rings | 3:1 |
| Disabled text | exempt from WCAG, but below ~2.5:1 it stops reading as "disabled" and starts reading as "broken" |

Focus rings need 3:1 against **both** the component and the page behind it — the common failure is a ring that clears the button but vanishes against the page. A two-tone ring (inner light, outer dark) is the reliable fix and works on any background.

### Importing vendor palettes (Tailwind, Radix)

`tokens/import-palette.mjs` rewrites the five ramps in `primitive.tokens.json` from a locally installed `tailwindcss` (v4 — the palette lives as CSS `@theme` in `theme.css`) or `@radix-ui/colors`, mapped onto the 50–1000 steps above. Normalization happens at the primitive tier only; the semantic layer and the contrast gate are untouched, and a gate failure after import is the gate working — the vendor step in that slot cannot carry its foreground, and the error names the step to swap. These are the mappings the script implements, and why.

**Tailwind, chromatic ramps** (accent/success/warning/danger) — the conventions line up, so it is nearly 1:1:

| Ours | Tailwind | Why |
|---|---|---|
| 50–900 | 50–900, 1:1 | Same nominal conventions: tw `<hue>-600` is the classic solid-button step, `50` the page tint. |
| 950 | OKLCH midpoint of 900/950 | Our 950's job (dark-theme surface, between raised 900 and page 1000) has no Tailwind equivalent — Tailwind has no step between. |
| 1000 | 950 | Both are "the darkest step". Tailwind added 950 in v3.3 for dark-mode page backgrounds, which is exactly our 1000's job. |

**Tailwind, the neutral ramp** — different, because Tailwind's neutral dark half runs one rung darker than the ramp recipe above (tw 700 at L .372 ≈ recipe 800's .375; tw 900 at .208 ≈ recipe 950's .205):

| Ours | Tailwind | Why |
|---|---|---|
| 50–400 | 50–400, 1:1 | The light halves agree. |
| 500, 600 | OKLCH midpoints of 400/500 and 500/600 | These two steps carry a **dual text constraint** — `fg.subtle` ≥3:1 on near-white in light *and* `fg.muted` ≥4.5:1 on near-black in dark (and vice versa) — that lands *between* Tailwind's rungs. Interpolated, never extrapolated. |
| 700–1000 | 600–950, shifted one slot down | Where the dark halves re-align: tw 600–950 match the recipe's 700–1000 within ~0.01 L. |

**Radix** — role-mapped using Radix's documented step semantics (radix-ui.com, "understanding the scale"), not position-mapped. Our 50–600 take light-scale steps whose documented role matches the slot's job; our 700–1000 take `*Dark`-scale steps, so the dark theme — which reads the ramp's dark end for surfaces and interaction states — renders Radix's dark-appearance values:

| Ours | Radix step | Radix's documented role |
|---|---|---|
| 50 | light 1 | app background |
| 100 | light 3 | UI element background |
| 200 | light 4 | hovered UI element background |
| 300 | light 5 | active / selected UI element background |
| 400 | light 7 | UI element border and focus rings |
| 500 | light 9 | solid backgrounds |
| 600 | light 11 | low-contrast text |
| 700 | dark 5 | active / selected UI element background |
| 800 | dark 4 | hovered UI element background |
| 900 | dark 3 | UI element background |
| 950 | dark 2 | subtle background |
| 1000 | dark 1 | app background |

Note what the Radix mapping gives up: Radix's light scale tops out at "high-contrast text" (step 12, unused here because our 700+ slots need dark-appearance values), so text steps 700/900 in a Radix-imported ramp are dark-scale *backgrounds* doing double duty. The gate decides whether that holds — measured, not assumed, same as everything else on this page.

---

## Spacing

Base grid **4px**. The scale, with names as multiples:

```
0    0px      none
1    4px      icon-to-label gaps, tight chrome
2    8px      inside small controls
3    12px     inside inputs/buttons (vertical)
4    16px     the default gap — card padding, stack rhythm
5    20px
6    24px     section padding, comfortable card padding
8    32px     between related sections
10   40px
12   48px     between unrelated sections
16   64px     page-level rhythm
20   80px
24   96px     hero/marketing rhythm
```

Skip 7, 9, 11 and everything above 24 deliberately — a gap in a scale is a design decision, and the missing rungs are what stop people fine-tuning their way out of the system.

**Density**: ship a `compact` mode as token overrides (`density.compact.tokens.json` — the build emits the changed vars under `[data-density="compact"]`), never as a second set of components. There are two places to cut, and they are not equivalent:

- **Re-value the component knobs** (`control.height`, `control.padding-x`, `card.padding`) — what the shipped file does. Controls drop 40→32px (md), card padding 24→16px. Tightens the data-dense chrome and leaves page rhythm untouched.
- **Re-value the mid-scale primitives** (`space.3: 8px`, `space.4: 12px`) — references re-resolve, so *everything* built on them tightens at once. More reach for less authoring, but it compresses hero and marketing rhythm along with the tables, and every "`space.4` = 16px" description becomes a lie under the attribute.

Data-dense tables need compact; marketing pages never do — which is the argument for the knob approach. Either way, a 32px control has lost the 44px touch target even counting the focus ring: compact is pointer-first, never touch.

---

## Type

Modular scale from a base of 16px:

| Ratio | Use |
|---|---|
| 1.125 (major second) | Extremely dense UI, dashboards |
| **1.200 (minor third)** | **Product UI — the safe default** |
| 1.250 (major third) | Standard product with more hierarchy |
| 1.333 (perfect fourth) | Marketing, editorial |

At 1.200 from 16px: `12.8 · 16 · 19.2 · 23 · 27.6 · 33.2 · 39.8 · 47.8`. Round to sensible pixels — `12, 14, 16, 19, 23, 28, 33, 40, 48` — because sub-pixel type sizes are a false precision.

Name by **role, not size**: `text.body`, `text.body-sm`, `text.label`, `text.heading-1`. A token called `text.24` gets used because it is 24px, which is exactly the coupling tokens exist to break.

Each type token is a **set**, not a size: `fontSize` + `lineHeight` + `fontWeight` + `letterSpacing`. Shipping size alone guarantees inconsistent line heights across the product.

```
heading-1   40px / 1.1  / 600 / -0.02em
heading-2   33px / 1.15 / 600 / -0.02em
heading-3   23px / 1.25 / 600 / -0.01em
body-lg     19px / 1.55 / 400 /  0
body        16px / 1.55 / 400 /  0
body-sm     14px / 1.5  / 400 /  0
label       14px / 1.4  / 500 /  0
caption     12px / 1.4  / 400 /  0.01em
code        14px / 1.5  / 400 /  0
```

Rules that hold across every product: line height falls as size rises (a 40px heading at 1.55 looks like unrelated lines). Letter-spacing goes negative for large text and slightly positive for small caps/captions. Measure caps at 60–75 characters for body copy — set `max-width: 65ch` on prose containers and it handles itself.

**Fluid type** for display sizes: `clamp(2rem, 1.5rem + 2.5vw, 3rem)`. Do not make body text fluid — users' zoom settings should win.

**Loading**: variable fonts, `font-display: swap`, preload the one weight above the fold, and always declare a metric-compatible fallback stack so the swap does not reflow the page.

---

## Radius

Five values, no more: `none 0 · sm 4px · md 8px · lg 12px · xl 16px · full 9999px`.

The one non-obvious rule: **nested radii must differ**. An inner element inside a padded container needs `outer − padding` or the curves look wrong. `inner = outer - padding` is the correct relationship, and it is worth a token comment because it is the most common visual bug in a system.

---

## Border width

Four values: `none 0 · sm 1px · md 2px · lg 4px`. Each has a job:

- **1px** is the default for everything with an edge — inputs, cards, dividers, table rules.
- **2px** is emphasis: selected cards, active segmented-control items, and the focus ring (`focus.ring-width` references `border-width.md`, so a selected border and a focus ring carry the same visual weight instead of accidentally differing by a pixel). The 1→2px bump is also the reliable non-colour signal for selection — a state conveyed by border *colour* alone still needs that colour at 3:1, and a width change sidesteps the whole question.
- **4px** is an indicator bar — active-tab underline, blockquote rule, one edge only. As a full outline it swallows 8px of a 40px control's interior; if you find yourself wanting a 4px border on all four sides, what you want is a background change.

No 3px, no 1.5px. On non-integer device-pixel-ratio screens (1.5× is common on Windows) fractional widths round unpredictably per edge, and a scale with a value between "default" and "emphasis" is an invitation to split the difference forever.

---

## Opacity

One token: `opacity.disabled = 0.5`. The set is deliberately this small because opacity is the invisible contrast killer — the gate checks resolved token pairs, and an `opacity` applied in a component composites *after* that check. Measured against the shipped ramps: 0.5 turns 14.35:1 body text into 3.01:1, and a primary button's white-on-accent label into 2.04:1. Disabled is the one place that is acceptable, because disabled UI is WCAG-exempt — though below ~2.5:1 it stops reading as "disabled" and starts reading as "broken", so 0.5 is close to the floor, not a starting point for further dimming.

For every other dimming job, use the colour tokens the gate *can* see: `color.fg.muted` for secondary text, `color.fg.disabled` when text must stay legible while the control is off. If a design keeps reaching for element opacity — hover fades, overlay tints — encode the result as a colour token (the way `color.bg.overlay` bakes its alpha into an `oklch(... / 0.6)` value) so it is named, themed and checkable.

---

## Elevation

Four levels. Each is a **pair** of shadows — a tight contact shadow plus a diffuse ambient one. A single blurred shadow always reads as a sticker.

```
flat      none
raised    0 1px 2px rgb(0 0 0 / .06),  0 1px 3px rgb(0 0 0 / .10)
overlay   0 4px 8px rgb(0 0 0 / .06),  0 8px 24px rgb(0 0 0 / .12)
modal     0 8px 16px rgb(0 0 0 / .08), 0 24px 48px rgb(0 0 0 / .16)
```

In **dark themes shadows do almost nothing** — black on near-black is invisible. Convey elevation with surface lightness instead (`bg.surface.raised` a step lighter than `bg.default`) and keep a much subtler shadow for edge definition, plus a 1px top highlight border if the design wants crispness.

Pair elevation with `z-index` tokens so stacking is systematic, not a bidding war:

```
base 0 · dropdown 1000 · sticky 1100 · overlay 1200 · modal 1300 · popover 1400 · toast 1500 · tooltip 1600
```

Gaps of 100 leave room to insert without renumbering. Anything with a `z-index` of 9999 in the codebase is a bug report waiting to happen.

---

## Motion

```
duration.instant   50ms    state flips that should feel immediate
duration.fast     150ms    hover, focus, small state change
duration.normal   250ms    the default — dropdowns, tooltips, accordions
duration.slow     400ms    modals, drawers, page-level transitions
duration.slower   600ms    large choreographed sequences only

easing.standard    cubic-bezier(0.2, 0, 0, 1)     most things
easing.emphasized  cubic-bezier(0.05, 0.7, 0.1, 1) entering, attention-drawing
easing.decelerate  cubic-bezier(0, 0, 0, 1)        entering the screen
easing.accelerate  cubic-bezier(0.3, 0, 1, 1)      leaving the screen
easing.spring      spring(1, 100, 15, 0)           physical, interruptible (Motion only)
```

Two principles behind the numbers: **exits are faster than entrances** (roughly 0.8×; a user who dismissed something has already moved on), and **distance scales duration** — a tooltip 4px away and a full-screen drawer should not share a duration. Anything above 400ms in an interface feels broken unless the user asked for it.
