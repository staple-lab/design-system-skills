# RFC 0000: <Component name>

- **Author:**
- **Status:** proposed <!-- proposed | accepted | rejected | superseded by NNNN -->
- **Date:**

## Problem

What can't be built well today? One paragraph. Name the user-facing task, not the
component you already have in mind — "users need to pick one option from 2–5 known
choices" invites better answers than "we need a SegmentedControl".

## Evidence (required: ≥3 real usages)

Link at least three places in the product that need this **today** — files, screens or
open PRs, not hypotheticals. If three don't exist, build it in the feature's folder and
come back when they do; promotion later is cheap, a dead system component is not.

1.
2.
3.

## Why composition doesn't cover it

The most common right answer to an RFC is "compose Button + Popover". Show the
composition you tried and where it genuinely breaks (behaviour, a11y, API ergonomics —
not aesthetics that a variant could fix).

## Proposed API

The signature, not the implementation. Show the 80% call site first, then the hardest
one you know about.

```tsx
<Thing option="…" />
```

- Which existing tokens does it consume? Any new component tokens it truly needs?
- `status: draft` on landing — see CONTRIBUTING.md for the graduation criteria.

## Alternatives considered

Including "do nothing" and "keep it product-local". What does each cost?

## Accessibility notes

- Role / semantics: what is it to a screen reader?
- Keyboard: every interaction reachable and escapable — list the keys.
- Name: where does the accessible name come from, and can the type system require it
  (see Button's icon-only union) rather than a docs note?
- Known hard parts: focus trapping, live announcements, touch target size?
