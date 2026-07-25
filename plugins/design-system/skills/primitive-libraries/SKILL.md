---
name: primitive-libraries
description: Use when building components on a headless primitive library - Base UI, Radix, React Aria Components, Ark UI - or deciding between them. Covers the composition/polymorphism API of each, the accessibility contract you inherit, state data-attributes for styling, portals, focus management, and what you must never re-implement by hand.
---

# Headless primitive libraries

The primitive layer owns **behaviour and accessibility**; you own **appearance**. The single most valuable thing it buys you is the stuff that is invisible when correct and career-limiting when wrong: focus trapping, typeahead, scroll locking, aria wiring, RTL, touch targets, screen-reader announcements, and the fifty keyboard edge cases in a listbox.

**Never re-implement a focus trap, a listbox, a combobox, a date picker or a dialog by hand.** If the primitive library ships it, wrap it. The correct version of any of these is thousands of lines and years of bug reports; the version you write in an afternoon works for you on a MacBook with a mouse and fails for everyone else.

## Picking one

One, and only one, per system. Two primitive libraries means two focus-management philosophies fighting inside the same portal — a real and very confusing class of bug.

- **Base UI** (`@base-ui/react`) — the default for new systems. Stable 1.x, full-time maintenance, built with the benefit of Radix's lessons.
- **Radix** (`@radix-ui/react-*`) — the incumbent. Widest ecosystem and the most examples in the wild (including in AI training data, which genuinely matters for agent-written code).
- **React Aria Components** (`react-aria-components`) — the strongest a11y/i18n story. Choose it for enterprise, government, regulated, or anything with a VPAT.
- **Ark UI** (`@ark-ui/react`) — when you must ship the same system to React *and* Vue/Solid/Svelte.

Full comparison in `design-system-architect/references/stack-menu.md`.

## The composition API — the decision that leaks everywhere

Each library solves "render my own element instead of yours" differently, and this choice shows up in every component you write. Match the repo's existing convention; record it in `design-system.config.json` under `conventions.polymorphism`.

```tsx
// Base UI — `render` takes an element or a function
<Menu.Item render={<Link href="/settings" />}>Settings</Menu.Item>
<Menu.Item render={(props, state) => <Link {...props} data-hot={state.highlighted} />} />

// Radix — `asChild` clones the single child and merges props onto it
<DropdownMenu.Item asChild>
  <Link href="/settings">Settings</Link>
</DropdownMenu.Item>

// React Aria — render props on state, plus named slots
<MenuItem href="/settings">
  {({ isSelected }) => <>Settings {isSelected && <CheckIcon />}</>}
</MenuItem>
```

`asChild` has one sharp edge worth knowing: it requires **exactly one** child element and merges props onto it, so a fragment, a text node, or a component that does not forward refs and spread props will fail — sometimes silently. Base UI's `render` avoids the fragment trap but has the same ref/spread requirement on the target.

## Styling hooks: `data-*` state attributes

All three expose state as data attributes on the rendered element. **Style from those, not from React state** — no `useState` mirror of "is this open", no conditional class strings. The primitive is the source of truth, and CSS reading the DOM directly is both simpler and impossible to desync.

```css
.button[data-disabled] { opacity: .5; pointer-events: none; }
.item[data-highlighted] { background: var(--ds-color-bg-subtle-hover); }
.content[data-state='open'] { animation: enter var(--ds-duration-normal) var(--ds-easing-decelerate); }
.content[data-state='closed'] { animation: exit var(--ds-duration-fast) var(--ds-easing-accelerate); }
.popover[data-side='top'] { transform-origin: bottom center; }
```

Attribute names differ by library — Radix leans on `data-state="open|closed"`, Base UI exposes `data-open` plus per-part attributes, React Aria uses `data-pressed`/`data-focus-visible`/`data-selected`. Check the component's docs rather than guessing; a selector that never matches is silent.

The `data-side` / `data-align` attributes on floating content are the ones people miss: they are how a popover animates *from* the trigger rather than from a fixed direction, and it is a large perceived-quality difference for two lines of CSS.

## What you must get right when wrapping

1. **Forward the ref.** Consumers need it for focus management, measurement and third-party integrations. In React 19 `ref` is a normal prop and `forwardRef` is no longer required, but if the codebase targets React 18 you still need it.
2. **Spread `...rest`** onto the element the consumer thinks they are styling — usually the outermost rendered node. Swallowing unknown props breaks `aria-label`, `data-testid`, analytics attributes and every escape hatch at once.
3. **Merge `className`, don't replace it.** Use `clsx`/`cn`. A component that drops the consumer's `className` has no escape hatch, and people will fork it.
4. **Do not fight the primitive's a11y.** If you find yourself adding `role` or `aria-*` to a primitive's output, you are probably about to break it. The exception is genuine app-level context (`aria-label` on an icon-only button) — that comes from the consumer.
5. **Keep the compound structure.** Flattening `<Dialog.Root><Dialog.Trigger/><Dialog.Content/></Dialog.Root>` into `<Dialog trigger={...} content={...}/>` looks tidier and costs you every composition case — and consumers will need one within a month. Wrap the parts, keep the shape.
6. **Portals + stacking.** Floating content renders in a portal at the document root, so it escapes your CSS scoping. That is why `z` tokens exist, and why theme attributes must live on `<html>` (a `[data-theme]` on a subtree will not reach a portal).

## Controlled and uncontrolled

Every primitive supports both. Your wrapper must preserve both — this is the number one thing wrappers accidentally break.

```tsx
// The wrapper stays transparent: pass through, never intercept.
export function Select({ value, defaultValue, onValueChange, ...rest }: SelectProps) {
  return <BaseSelect value={value} defaultValue={defaultValue} onValueChange={onValueChange} {...rest} />;
}
```

Do not "helpfully" add `useState` inside the wrapper. The moment you do, the controlled case has two sources of truth and the component starts fighting its consumer.

## The a11y you still own

The primitive cannot do these for you:

- **Accessible names.** An icon-only button needs `aria-label`. Make it *required in the type system* when there is no text child — a props type is a better enforcement mechanism than a lint rule or a code review.
- **Focus visibility.** Primitives manage focus; they do not style it. Every interactive element needs a visible ring at 3:1 against both the component and the page. Use `:focus-visible`, never `:focus` (which fires on mouse click and gets designers asking you to remove it — at which point keyboard users lose it entirely).
- **Colour contrast.** Owned by the token layer and gated in the token build.
- **Touch targets.** 44×44 CSS px minimum for anything tappable. A 32px control can meet it with padding or a pseudo-element that extends the hit area beyond the visual bounds.
- **Motion.** `prefers-reduced-motion` is your job. See the `motion-system` skill.
- **Copy.** Error messages, empty states, and announcement text are content, not markup — but they are the part screen-reader users actually hear.

## Version pinning

Primitives are behavioural infrastructure: a minor bump can change focus order or keyboard handling in a way no type error catches. Pin exact versions in the design system package, upgrade deliberately, and run the behavioural suite on upgrade — that suite exists precisely to make these upgrades boring.
