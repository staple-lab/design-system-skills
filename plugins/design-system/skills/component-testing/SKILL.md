---
name: component-testing
description: Use when writing or reviewing tests for design system components - behavioural tests with Vitest and Testing Library, keyboard and focus tests, axe accessibility assertions, controlled/uncontrolled parity, visual regression, and Storybook play functions. Triggers on "test this component", "a11y test", "visual regression", "storybook test".
---

# Component testing

A design system component is a **contract**, and the tests are the executable half of it. Consumers depend on behaviour they never read the source for, so the test suite's job is to make that behaviour impossible to change by accident.

## Test behaviour, not implementation

```tsx
// Bad — asserts the implementation; breaks on every refactor, catches nothing
expect(wrapper.find('.btn-primary').prop('isOpen')).toBe(true);
expect(container.querySelector('div > span:nth-child(2)')).toBeTruthy();

// Good — asserts what a user experiences
await user.click(screen.getByRole('button', { name: 'Open menu' }));
expect(screen.getByRole('menu')).toBeVisible();
expect(screen.getByRole('menuitem', { name: 'Settings' })).toHaveFocus();
```

Query by **role and accessible name**, in this priority: `getByRole` → `getByLabelText` → `getByText` → `getByTestId` (last resort). This is not stylistic. `getByRole('button', { name: 'Save' })` fails when the accessible name breaks, which means **your functional tests double as accessibility tests for free**. A test suite full of `getByTestId` passes happily while the component is unusable with a screen reader.

## The contract suite

Every component gets these. Copy `${CLAUDE_PLUGIN_ROOT}/templates/testing/Button.contract.test.tsx` and adapt — the shape should be identical across components so a reviewer can see at a glance what is missing.

1. **Renders every variant × size × state.** Cheap, and catches the CVA key typo that silently renders unstyled.
2. **Keyboard map.** Every documented key, including the ones people forget: `Escape` closes and returns focus to the trigger, `Tab` order is correct, arrows move within a composite widget, `Home`/`End` jump, typeahead selects.
3. **Focus management.** Focus moves *into* a dialog on open and *back to the trigger* on close. This is the single most commonly broken behaviour in hand-rolled components and the most disorienting for keyboard users.
4. **Controlled and uncontrolled parity.** Both modes work; `onValueChange` fires in both. Test them as two runs of the same assertions.
5. **Ref forwarding.** The ref lands on a real DOM node.
6. **`className` merged, `...rest` spread.** The escape hatches, as tests — otherwise they rot.
7. **Disabled semantics.** Not activatable by click or keyboard, and communicated to assistive tech (`disabled` or `aria-disabled`, deliberately chosen — `aria-disabled` keeps the element focusable, which is often *better* because a focusable disabled control can explain why).
8. **axe clean**, in every variant and both themes.

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'vitest-axe';

it.each(['primary', 'secondary', 'ghost', 'danger'] as const)('%s variant has no a11y violations', async (variant) => {
  const { container } = render(<Button variant={variant}>Save</Button>);
  expect(await axe(container)).toHaveNoViolations();
});

it('returns focus to the trigger when the dialog closes', async () => {
  const user = userEvent.setup();
  render(<Example />);
  const trigger = screen.getByRole('button', { name: 'Open' });
  await user.click(trigger);
  await user.keyboard('{Escape}');
  expect(trigger).toHaveFocus();
});
```

Always `userEvent`, never `fireEvent`. `fireEvent.click` dispatches one synthetic event; `userEvent.click` does the pointerdown/mousedown/focus/mouseup/click sequence a real user produces. Components that pass with `fireEvent` and fail in the browser are almost always failing on that difference.

## What axe does and does not catch

Automated a11y testing catches roughly **30–40%** of WCAG issues. It is a floor, not a ceiling, and treating a green axe run as "accessible" is the most common mistake in this area.

Caught: missing labels, contrast (when computable), invalid ARIA, duplicate ids, missing landmarks, non-focusable interactive elements.

**Not caught, and therefore your job:**
- Focus *order* being logical rather than merely present
- Whether an accessible name is *useful* ("Button 3" passes)
- Whether an error message is announced when it appears
- Whether a live region interrupts at the right moment
- Whether the keyboard path to a feature is reasonable rather than technically possible
- Whether the component works with an actual screen reader

Write explicit tests for focus order, announcements and keyboard paths. And at least once per release, drive the component with VoiceOver or NVDA — nothing substitutes for hearing it.

## Storybook

Storybook 10's **Vitest addon** replaced the old `@storybook/test-runner`. Stories become test cases via play functions, and the a11y addon runs axe in the same pass — one artifact serving docs, manual review and automation.

```tsx
export const OpensOnClick: Story = {
  play: async ({ canvasElement, step }) => {
    const canvas = within(canvasElement);
    await step('opens the menu', async () => {
      await userEvent.click(canvas.getByRole('button', { name: 'Options' }));
      await expect(canvas.getByRole('menu')).toBeVisible();
    });
  },
};
```

The division of labour that works: **stories for states worth looking at** (they are the docs, and they feed visual regression), **unit tests for logic and edge cases** (faster, and better failure messages).

## Visual regression

Behaviour tests do not catch a broken border radius or a token that resolved to the wrong colour. VRT does, and for a design system it earns its keep more than in a product app because one component change touches every screen.

- **Playwright** screenshots — free, deterministic, you host the baselines.
- **Chromatic** — hosted, handles review workflow and cross-browser, costs money.

Snapshot every component in: each variant, both themes, and at 200% zoom. Disable animations and freeze anything time-based, or you will spend your life triaging flakes:

```ts
await page.emulateMedia({ reducedMotion: 'reduce' });
```

Keep a strict diff threshold. A loose one means real regressions slip through, which is worse than not having VRT at all — it manufactures false confidence.

## Token and theme tests

Cheap, and they catch the failures that are hardest to spot by eye:

```ts
it('every semantic token is defined in every theme', () => {
  const { themes } = tokens;
  const paths = Object.keys(themes.light);
  for (const [name, theme] of Object.entries(themes)) {
    expect(Object.keys(theme).sort()).toEqual(paths.sort());   // a hole in a theme is a silent bug
  }
});

it('components reference no primitive tokens directly', () => {
  // tier violations kill theming — the lint rule catches source, this catches the built output
  const css = readFileSync('dist/styles.css', 'utf8');
  expect(css).not.toMatch(/var\(--ds-color-(neutral|accent|success|warning|danger)-\d+\)/);
});
```

The contrast gate already runs in the token build. Do not duplicate it here; make sure it runs in CI.

## What not to test

- Third-party primitive internals — Radix tests Radix. Test *your wrapper's* contract.
- Exact class names or CSS output. That is VRT's job, and asserting on classes is what makes refactors painful.
- Snapshot tests of rendered markup. They fail on every change and get rubber-stamped with `-u`, at which point they are pure cost. Targeted assertions or a real VRT tool.

## CI gates

```
typecheck → unit + a11y → token build (contrast gate) → lint → VRT → build → publint/attw
```

Fail the build on: a11y violations, contrast failures, type errors, DS lint errors. Warn on: coverage dip, bundle-size growth beyond a threshold.

Coverage floor around 80% for a design system — higher than a typical app, because consumers cannot see inside and a regression ships everywhere at once. Do not chase 100%: the last 15% is usually error branches that would need contrived setups, and the effort is better spent on a real screen-reader pass.
