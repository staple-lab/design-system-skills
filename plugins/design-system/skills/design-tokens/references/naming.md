# The token naming contract

Token names in this system are an API, not a labelling convention. Four separate tools parse
them — the lint rules, the registry scanner, the inventory site and the token build's own
emitters — so a name that "reads fine" but breaks the grammar breaks tooling, not taste.
This file writes down the grammar those tools actually implement. Everything here is checkable
against `templates/tokens/build.mjs` and the shipped `*.tokens.json`.

## Three tiers, and what may reference what

```
PRIMITIVE    color.accent.600            raw ramps and scales — no references
   ↑ referenced by
SEMANTIC     color.bg.accent             meaning — references primitives ({color.accent.600})
   ↑ referenced by
COMPONENT    control.height.md           per-component knobs — reference semantic ({space.3}, {radius.md})
```

Components (the CSS) consume **semantic and component tokens only**. The tier of a token is
determined by its **path**, not by which file it is authored in — `tier()` in `build.mjs` is
the classifier, and it works like this:

| Path shape | Tier | Examples |
|---|---|---|
| `color.(bg\|fg\|border\|ring\|shadow).*` | semantic | `color.bg.accent`, `color.fg.on-accent` |
| head in `space, radius, border-width, opacity, shadow, duration, easing, z, type, font` | semantic | `space.4`, `type.body`, `z.popover` |
| any other multi-segment head | component | `control.height.md`, `focus.ring-width`, `dialog.max-width` |
| everything else | primitive | `color.accent.600`, `color.neutral.50`, `color.white` |

Two consequences worth knowing before they surprise you:

- **The only primitive-tier paths in the shipped templates are the colour ramps.** The
  dimension scales are single-tier: `space.4` classifies as *semantic*, which is why
  `var(--ds-space-4)` in a component passes `no-primitive-token` while
  `var(--ds-color-accent-600)` fails it. Colour gets two tiers because colour re-themes;
  16px does not.
- **A new top-level category defaults to the component tier.** Add a `size.*` group and every
  token in it silently classifies as `component` unless you extend `tier()`'s head list or set
  `$extensions["design-system"].tier` per token. If lint stops flagging something it should
  flag, check the tier before checking the rule.

## The dot path

`category.role[.variant]`, general to specific, lowercase, kebab-case within a segment:

```
color.bg.accent        color.bg.accent-hover     color.fg.on-accent
space.4                radius.md                 border-width.sm
type.body              duration.fast             z.popover
control.height.md      focus.ring-width          card.padding
```

Numbers appear only as primitive ramp steps (`color.accent.600`) and spacing multiples
(`space.4` = 4 × 4px). A semantic name never carries a bare number — `color.bg.surface.2`
tells you nothing about when to use it, and the inventory's ramp detector
(`/^color\.([a-z]+)\.(\d+)$/` in `templates/inventory/src/pages.tsx`) would render it as a
colour ramp step.

Composite typography tokens expand at build time: `type.body` becomes `type.body.font-size`,
`.line-height`, `.font-weight`, `.letter-spacing` and `.font-family` — CSS has no way to hold
a composite, and consumers want the parts anyway.

## Flattening to CSS custom properties

`varName()` in `build.mjs`: prepend `--<prefix>-`, dots become hyphens, camelCase becomes
kebab, everything lowercased.

```
color.bg.accent        →  --ds-color-bg-accent
type.body.font-size    →  --ds-type-body-font-size
control.height.md      →  --ds-control-height-md
```

The flattening is **lossy**: both `.` and `-` map to `-`, so `--ds-color-bg-accent-hover`
could name `color.bg.accent-hover` or `color.bg.accent.hover` and the var alone cannot tell
you which. That is why every tool that goes backwards — the registry scanner, the lint index —
inverts through the `var` field in the generated `tokens/dist/tokens.json` instead of doing
string surgery on the var name. It is also why hand-writing a var name that "should" exist is
a silent failure: `var(--ds-color-bg-acent-hover)` resolves to nothing at runtime and the
element renders with the inherited value. The registry build warns on exactly this.

## The prefix is configurable. The structure is not.

`tokens.prefix` in `design-system.config.json` (default `"ds"`) sets the `--ds-` part. The
token build emits with it, the registry scanner reads it before scanning, the lint rules take
it via `settings.designSystem.prefix`, and the generated `AGENTS.md` renders its examples with
it. A project on `--acme-*` gets the same tokens-consumed lists and the same unknown-var
warnings, because a prefix is a *rename*: applied at one point of emission, inverted through
one generated file, and no consumer parses meaning out of it.

The structure after the prefix is a different matter. These four parse it:

1. **The lint rules** (`templates/lint/eslint-plugin-design-system.mjs`) — `no-primitive-token`
   bans by tier, which is derived from the path; `no-raw-color` prefers a semantic suggestion
   over a primitive one that resolves to the same hex; `no-hardcoded-dimension` prefers
   `space.*` paths when suggesting a replacement.
2. **The registry scanner** (`templates/registry/build-registry.mjs`) — matches
   `--<prefix>-[a-z0-9-]+` in component sources and inverts through `tokens.json` to produce
   each component's `tokens` and `unknownTokens` lists.
3. **The inventory site** (`templates/inventory/src/`) — detects ramps with
   `/^color\.([a-z]+)\.(\d+)$/`, derives type roles from `type.<role>.*`, and filters the
   foundations page on `space.`, `radius.`, `shadow.` prefixes.
4. **The build's own emitters and gates** (`templates/tokens/build.mjs`) — `tailwindName()`
   maps `color.bg.*` → `--color-*` and `color.fg.on-x` → `--color-x-foreground`; the Panda
   preset splits `tokens` from `semanticTokens` via `tier()`; and the contrast gate discovers
   its pairs *by name*: `color.fg.on-<x>` must clear against `color.bg.<x>`, every other
   `color.fg.*` against `color.bg.default` and `color.bg.surface`.

Making the structure configurable would turn all four into config-aware parsers, and —
worse — `registry.json` and `tokens.json` would stop having one shape across projects, which
ends the single-registry model: `AGENTS.md`, `llms.txt`, the MCP server and the adoption
reports are all views over those two files having a known grammar. One knob (the prefix) costs
one config read. A grammar knob costs four parsers and the architecture.

## Naming rules for the semantic tier

- **Name the role, never the value.** `color.bg.accent`, not `color.orange.600` promoted to a
  component. A value-name becomes a lie at the first rebrand (`orange-600` pointing at blue)
  and at the first dark theme: the shipped `fg.muted` re-points from `neutral.600` in light to
  the *lighter* `neutral.500` in dark, so any name that described the value ("gray-dark")
  would now describe the wrong one. Roles survive re-pointing; values are the thing that
  re-points.
- **State suffixes hang off the role with a hyphen**: `color.bg.accent-hover`,
  `color.bg.accent-active`, `color.bg.subtle-hover`. Not a new dot segment (the flattening
  above is why), and not a new role — hover is a state of `accent`, so it stays lexically
  attached to `accent`.
- **`on-<x>` names the foreground that sits on `bg.<x>`**, and the contrast gate finds the
  pair by that name alone. This is also where naming carries real colour knowledge:
  `color.fg.on-warning` resolves to near-black, not white, because the amber ramp peaks too
  light for white text — the name records the pairing so the gate can verify the decision.
- **Component tokens exist only where a component needs its own knob.** `control.height.md`
  earns its place because `density.compact` must re-value it (40px → 32px) without touching
  the `space` scale everything else is built on. `card.padding` is `{space.6}` with a name —
  the shipped `component.tokens.json` says so in its own `$description`, and every component
  token is another line to keep correct in every theme, density and brand. When in doubt,
  consume the semantic token directly.
