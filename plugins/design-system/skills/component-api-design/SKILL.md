---
name: component-api-design
description: Use when designing or reviewing a component's props API - variants, sizes, controlled vs uncontrolled state, compound components, polymorphism, escape hatches, TypeScript prop types, ref forwarding, and naming. Triggers on "component API", "props design", "should this be a prop or a slot", "how do I type this component".
---

# Component API design

The props API is the **public contract**. Styles can be fixed in an afternoon; a bad API is in a hundred call sites and stays wrong for years. Spend the extra hour here.

## Boolean props are a trap

The most common API mistake, and it compounds:

```tsx
// Bad — every new state doubles the invalid combinations
<Button primary secondary danger large small loading disabled />

// Good — enumerated, mutually exclusive by construction
<Button variant="primary" size="lg" loading />
```

`variant` and `size` should be **string unions**. Booleans are for genuinely independent binary states (`loading`, `disabled`, `fullWidth`). The test: if two props can never be true at once, they are one prop with a union type.

## Controlled, uncontrolled, or both

Both — and the convention is non-negotiable because consumers expect DOM semantics:

```tsx
interface Props {
  value?: string;              // controlled
  defaultValue?: string;       // uncontrolled initial
  onValueChange?: (v: string) => void;   // fires in BOTH modes
}
```

Rules:
- `value` present → controlled. The component never updates its own state; it renders what it is given.
- `value` absent → uncontrolled, `defaultValue` seeds it.
- `onValueChange` fires in **both** modes. A callback that only fires when uncontrolled is a bug people hit at the worst time.
- **Never switch modes mid-life.** Warn in dev if `value` goes from `undefined` to defined.
- Name it `onValueChange`, not `onChange`, when it emits a value rather than an event — `onChange` implies a React `ChangeEvent`, and the mismatch bites at the first `e.target.value`.

Most primitive libraries already implement this correctly. **Pass the props straight through** and do not add a `useState` inside the wrapper; that is how wrappers break the controlled case.

## Compound components

When a component has parts a consumer needs to arrange, reorder or replace, expose the parts:

```tsx
<Dialog.Root>
  <Dialog.Trigger>Open</Dialog.Trigger>
  <Dialog.Content>
    <Dialog.Title>Delete project</Dialog.Title>
    <Dialog.Description>This cannot be undone.</Dialog.Description>
    <Dialog.Footer>
      <Dialog.Close>Cancel</Dialog.Close>
      <Button variant="danger">Delete</Button>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>
```

The alternative — `<Dialog title="..." description="..." footer={<>...</>} />` — looks tidier and dies on the first requirement that does not fit the props you imagined. A component with three or more `ReactNode` props is a compound component wearing a disguise.

**When NOT to go compound:** a `Button` with an icon does not need `Button.Icon`. Use compound parts when the *arrangement* varies, props when only the *content* varies.

Both can coexist: ship `<Dialog>` as a convenience wrapper over the parts for the 80% case, and export the parts for the rest. Make sure the convenience version is implemented *using* the parts, or the two drift.

## Slots

For content in fixed positions, `ReactNode` props are right:

```tsx
interface TextFieldProps {
  label: ReactNode;
  description?: ReactNode;
  errorMessage?: ReactNode;
  startAdornment?: ReactNode;   // "adornment"/"slot", not "icon" — people put buttons and badges there
  endAdornment?: ReactNode;
}
```

Type them `ReactNode`, not `string`. The moment someone needs `<label>Name <Required/></label>` a `string` type forces a fork.

## Polymorphism

One convention per system (`conventions.polymorphism` in the brief). Whichever it is, the typing needs to preserve the target element's props:

```tsx
// `render` (Base UI style)
<Button render={<a href="/pricing" />}>See pricing</Button>

// `asChild` (Radix style)
<Button asChild><a href="/pricing">See pricing</a></Button>
```

Do not invent a third. And prefer polymorphism over a `href` prop — the moment you add `href` you are reimplementing an anchor, and you will get `target`, `rel`, `download` and router integration wrong in that order.

## TypeScript

```tsx
import type { ComponentPropsWithRef, ReactNode } from 'react';
import type { VariantProps } from 'class-variance-authority';

export interface ButtonProps
  extends ComponentPropsWithRef<'button'>,          // inherit every native prop, including ref (React 19)
    VariantProps<typeof buttonVariants> {           // variant/size derived from the styles — one source
  loading?: boolean;
  startIcon?: ReactNode;
}
```

- **Extend the native element props.** Consumers will need `type="submit"`, `form`, `aria-*`, `data-testid`. Re-declaring a subset guarantees you missed one.
- **Derive variant types from the style definition** so adding a variant to CVA cannot desync from the type.
- **Export every prop type.** Consumers wrap your components; without the type they write `any`.
- Use `interface` for public props (better error messages, declaration merging) and `type` for unions.

Encode invariants in the type rather than documenting them. An icon-only button that requires a label:

```tsx
type ButtonProps = BaseProps &
  ({ children: ReactNode; 'aria-label'?: string } | { children?: never; 'aria-label': string });
```

Now the unlabelled icon button does not compile. That is worth more than a lint rule and infinitely more than a docs note.

## Defaults

Every optional prop needs a sensible default so the zero-config case is the common case. `<Button>Save</Button>` should render the primary button at the default size. If a component cannot render without four props, the API is wrong.

Defaults belong in **one** place — the CVA/recipe `defaultVariants` or the destructure, not both.

## Naming

| Do | Don't | Why |
|---|---|---|
| `variant`, `size`, `tone` | `type`, `style`, `kind` | `type` and `style` collide with native props |
| `isOpen` / `open` | `visible`, `shown`, `active` | Match the DOM/ARIA vocabulary |
| `onValueChange` | `onUpdate`, `handleChange` | `on` + noun + `Change` reads at the call site |
| `disabled` | `isDisabled`, `enabled` | Match the native attribute; never invert a native boolean |
| `startIcon` / `endIcon` | `leftIcon` / `rightIcon` | Left and right swap in RTL; start and end do not |

Consistency beats individual elegance. If the system already uses `isOpen`, the next component uses `isOpen`.

## Escape hatches

Every component needs exactly one deliberate way out, or people fork it:

1. `className` passthrough, merged not replaced (`cn(styles.base, className)`)
2. `...rest` spread onto the outer element
3. `ref` forwarded
4. Component-level CSS custom properties for the values most likely to need overriding

The failure mode is silent: a developer needs a 2px adjustment, finds no way in, copies the component into their feature folder, and now there are two buttons. You never hear about it.

## The review checklist

Before a component is called done:

- [ ] No boolean props that should be a union
- [ ] Controlled *and* uncontrolled both work, `onXChange` fires in both
- [ ] Extends native element props; ref reaches a real DOM node
- [ ] `className` merged, `...rest` spread, both verified by a test
- [ ] Every variant × size × state combination renders (that is a test, not an eyeball)
- [ ] Disabled state is not focusable-but-interactive, and communicates *why* when it can
- [ ] Loading state preserves layout (no reflow when a spinner replaces a label)
- [ ] Keyboard operable end to end; focus visible at 3:1
- [ ] Works in both themes and at 200% browser zoom
- [ ] Prop types exported
- [ ] Registry entry filled in — props, a11y notes, do/don't, tokens consumed
