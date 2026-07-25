---
name: packaging-distribution
description: Use when publishing a design system as an npm package or setting up its build and release - exports maps, dual ESM/CJS, sideEffects and CSS delivery, peer dependencies, "use client" for RSC, tree-shaking, versioning with changesets, and verifying with publint and attw. Triggers on "publish the design system", "npm package", "exports map", "changesets", "monorepo package".
---

# Packaging and distribution

## First: should this be a package at all?

| Mode | When |
|---|---|
| **In-repo** (`src/design-system/`) | One app. No version boundary, no release step, change and use in the same commit. **The right default.** |
| **Workspace package** | Monorepo, 2+ sibling apps. Versionless internally, real boundary. |
| **Private npm** | Consumers outside the repo, inside the company. |
| **Public npm** | External consumers. Everything below becomes mandatory, and so does a deprecation policy. |

A package adds a version boundary, a release process, and a lag between a fix and its use. That cost is worth paying at two or more consumers and rarely worth it at one. Say this plainly when someone asks to publish on day one.

## The `exports` map

The most common way a design system release breaks consumers.

```jsonc
{
  "name": "@acme/ui",
  "type": "module",
  "sideEffects": ["*.css"],
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js",
      "require": "./dist/index.cjs"
    },
    "./button": {
      "types": "./dist/button.d.ts",
      "import": "./dist/button.js",
      "require": "./dist/button.cjs"
    },
    "./styles.css": "./dist/styles.css",
    "./tokens": "./dist/tokens/index.js",
    "./tokens.css": "./dist/tokens/tokens.css",
    "./package.json": "./package.json"
  },
  "files": ["dist"],
  "peerDependencies": { "react": ">=18", "react-dom": ">=18" },
  "peerDependenciesMeta": { "react-dom": { "optional": true } }
}
```

The details that bite:

- **`types` first in every condition.** Conditions resolve in order; if `import` precedes `types`, TypeScript takes the JS path and consumers get `any` with no error to explain it.
- **Subpath entries, not a wildcard.** `"./button"` is a supported API; `"./*": "./dist/*"` exposes every internal file as public surface and freezes your directory layout forever.
- **Export `./package.json`.** Some tooling reads it and hard-fails without this line.
- **`sideEffects: ["*.css"]`.** `false` makes bundlers drop your stylesheet — the component library that renders unstyled in production and works locally. Listing CSS keeps tree-shaking for JS while protecting the styles.
- **React in `peerDependencies`, never `dependencies`.** Two copies of React is an instant hook-error crash, and it is confusing to diagnose from the consumer's side.

## Build

**tsdown** (Rolldown-based) or **tsup** (esbuild-based). Both do ESM + CJS + `.d.ts` from one config.

```ts
import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: ['src/index.ts', 'src/button.ts', 'src/dialog.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  sourcemap: true,
  clean: true,
  external: ['react', 'react-dom'],
  // Preserve the directive — bundlers strip it by default and RSC apps then fail at runtime.
  banner: { js: '' },
});
```

**Ship ESM-first.** CJS remains necessary for Jest setups and older Node tooling, so dual-format is still the safe answer in 2026, but ESM is the one to optimise.

## RSC and `"use client"`

If any consumer uses React Server Components, interactive components need the directive — **on the components that need it**, not blanketed across the entry point. A `"use client"` on your barrel file drags the entire library into the client bundle and silently destroys the consumer's server-rendering.

```tsx
'use client';
export { Button } from './Button';
```

Keep purely presentational components (a `Badge`, a `Card` with no handlers) free of it so they can render on the server. Verify in a real Next.js app before release; nothing else catches this.

## CSS delivery

Depends on the CSS system, and the README must state which:

| System | Consumer does |
|---|---|
| CSS Modules / vanilla-extract | `import '@acme/ui/styles.css'` — one file, simplest story |
| Tailwind | `@import '@acme/ui/tokens.css'` + `@source '../node_modules/@acme/ui'` so their build scans your classes |
| Panda | Consume your preset in `panda.config.ts` |
| StyleX | Consumers must run the StyleX build plugin — the heaviest requirement here, say so loudly |

Always ship `tokens.css` separately from component CSS. Consumers who want your tokens without your components are a real and common case, and serving them costs you nothing.

## Versioning

**Changesets.** Every PR that changes behaviour adds a changeset; release notes generate themselves.

Semver for a design system, interpreted honestly:

- **major** — a removed or renamed prop, a changed default, a DOM structure change consumers style against, a raised peer range.
- **minor** — new component, new prop, new token.
- **patch** — bugfix with no API change.

**A visual change is at least a minor.** It is not a bugfix if every screen in the consuming product looks different afterwards, even when the old rendering was wrong.

Deprecate before removing, always: mark with `@deprecated` in JSDoc (so it strikes through in the editor — the most effective deprecation channel there is), keep it working for at least one minor, ship a codemod if the migration is mechanical, and give a removal version.

## Verify before publishing

```bash
npm run build
npx publint                       # packaging correctness
npx @arethetypeswrong/cli --pack  # do the types actually resolve, per condition
npm pack --dry-run                # exact file list + unpacked size
```

Then install the tarball into a scratch app and import it — ESM and CJS, and in a Next.js app if RSC matters. Every packaging bug that reaches consumers passed the unit tests, because unit tests import from source, not from the built package.

**Publishing is outward-facing and irreversible for a given version.** Confirm with the user before `npm publish`, every time, and show them the pack output first. Use `--provenance` in CI for public packages.

## Bundle discipline

- Per-component entry points so consumers pay for what they import.
- `size-limit` in CI with a budget per entry; fail on regression.
- Watch the primitives — each Radix package is small, but twenty of them are not.
- Icons are the classic blowout. Never re-export an icon set from the barrel; let consumers import icons directly.
- Publish the numbers in the inventory's status board. A component library that quietly grows 40kb loses its own argument.
