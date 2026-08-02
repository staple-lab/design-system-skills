/**
 * Live examples for the inventory site. The catalogue eagerly globs
 * `components/*​/*.examples.tsx` and renders these; without this file every example on
 * Button's page degrades to a dead code block reading "Code only — add
 * <Name>.examples.tsx next to the component to render it live."
 *
 * THE NAMING CONTRACT, and it is exact: one **no-props** export per example in
 * `Button.meta.json`, named as that example's `title` with every non-alphanumeric
 * character stripped. "Icon only" → `Icononly`. "As a link" → `Asalink`. An
 * `Example`-prefixed form also resolves; the bare one is preferred. A title with no
 * matching export is a silently dead preview — nothing errors, the page just shows code.
 *
 * These render inside a docs page under BOTH themes, which drives three rules:
 *   1. Self-contained. No props, no external state, no router.
 *   2. Anything that opens renders a TRIGGER with local state — never an always-open
 *      overlay, which portals to the body and covers the whole site.
 *   3. Semantic tokens only. Nothing that assumes light or dark.
 */
import { useState } from 'react';
import { Button } from './Button';

// A stand-in so the template stays dependency-free. Real examples import from the
// configured icon pack (`import { Plus } from 'lucide-react'`) via the Icon component.
function PlusIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M12 5v14M5 12h14" strokeLinecap="round" />
    </svg>
  );
}

const row: React.CSSProperties = {
  display: 'flex',
  gap: 'var(--ds-space-3)',
  alignItems: 'center',
  flexWrap: 'wrap',
};

export function Variants() {
  return (
    <div style={row}>
      <Button variant="primary">Primary</Button>
      <Button variant="secondary">Secondary</Button>
      <Button variant="ghost">Ghost</Button>
      <Button variant="danger">Delete</Button>
    </div>
  );
}

export function Sizes() {
  return (
    <div style={row}>
      <Button size="sm">Small</Button>
      <Button size="md">Medium</Button>
      <Button size="lg">Large</Button>
    </div>
  );
}

/**
 * Interactive on purpose. A static spinner shows what loading looks like; this shows
 * what it *does* — the button stays focusable so a screen-reader user can reach it and
 * hear why nothing happened, which is the whole design decision.
 */
export function Loading() {
  const [busy, setBusy] = useState(false);
  return (
    <div style={row}>
      <Button
        loading={busy}
        onClick={() => {
          setBusy(true);
          setTimeout(() => setBusy(false), 1800);
        }}
      >
        Save changes
      </Button>
      <Button variant="secondary" loading>
        Always loading
      </Button>
    </div>
  );
}

export function Icononly() {
  return (
    <div style={row}>
      <Button aria-label="Add item" startIcon={<PlusIcon />} />
      <Button variant="secondary" size="sm" aria-label="Add item" startIcon={<PlusIcon />} />
    </div>
  );
}

/** `render` keeps the styles and behaviour while swapping the element — never an `href` prop. */
export function Asalink() {
  return (
    <div style={row}>
      <Button render={<a href="#pricing" />}>View pricing</Button>
      <Button variant="ghost" render={<a href="#docs" />} endIcon={<PlusIcon />}>
        Read the docs
      </Button>
    </div>
  );
}
