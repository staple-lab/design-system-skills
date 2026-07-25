---
description: Turn the design system into a publishable npm package — exports map, build, types, versioning, release CI
argument-hint: "[e.g. '@acme/ui, public', 'private registry', 'dry run']"
---

# Package + publish the design system

Request: `$ARGUMENTS`

Invoke the `packaging-distribution` skill.

Decide first, with the user, whether this should even be a package. In-repo (`src/design-system/`) is the right answer for a single app — a package adds a version boundary, a release process and a lag between change and use. A package earns its keep when 2+ apps consume it, or when consumers are outside your repo.

If packaging, get these right — they are the ones that break consumers:

- **`exports` map** with `types` first in each condition, and subpath entries so `@acme/ui/button` works without exposing internals
- **`"sideEffects"`** declared honestly, listing CSS files, so bundlers can tree-shake without dropping your styles
- **peerDependencies** for `react`/`react-dom` (never a hard dependency — two Reacts is a hook-error crash) and for the CSS system's runtime if it has one
- **CSS delivery** that matches the CSS system: a shipped stylesheet, a Tailwind preset + source glob, a vanilla-extract build step, or a Panda preset — each is a different consumer install story and the README must say which
- **`"use client"`** placement if consumers use RSC — on the interactive components, not blanketed over the whole entry
- **types that actually resolve** — verify with `attw` (Are The Types Wrong) and `publint`, not by assuming
- **Changesets** for versioning, with the release notes generated from them

Ship a `dry-run` first (`npm pack` + inspect the tarball contents) and show the user exactly what files would be published and the unpacked size. Publishing is outward-facing and irreversible for a given version number — confirm with the user before the actual `npm publish`, every time.
