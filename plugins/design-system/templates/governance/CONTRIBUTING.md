# Contributing to the design system

The lifecycle below is enforced by machines where a machine can enforce it — the
registry build (`npm run registry:check`) is the arbiter, not this document. Where a
criterion says "the registry warns/fails", that is a statement of fact about
`scripts/build-registry.mjs`, and this file must be updated if that behaviour changes.

## Proposing a component

Open an RFC (copy `governance/rfcs/0000-template.md` to `rfcs/NNNN-<name>.md`) **before
writing the component**. The bar for entry is evidence, not enthusiasm: at least three
real, linkable usages in the product that this component would replace. Two usages is a
shared file in the feature's own folder; a design system component is a promise of
maintenance forever, and three is the minimum evidence that promise pays for itself.

The design system maintainers (see `CODEOWNERS`) review RFCs. They are looking for one
answer above all: **can this be composed from what already exists?** "No, and here is
why" is a required section of the template.

## Lifecycle

Status lives in `<Name>.meta.json` and is published by the registry to the inventory
site, `AGENTS.md` and the lint rules. Each transition has mechanical criteria — a
checklist, not a vibe.

### draft

Where every component starts. A component directory with a `<Name>.tsx` and no meta
file is treated as draft by the registry (it warns, then defaults the status).

- May change or vanish without notice. Excluded from `AGENTS.md`'s shipped list.
- Entry criteria: an accepted RFC, or a maintainer's explicit "build it and see".

### draft → beta

All of the following, verifiable from the registry output:

- [ ] `<Name>.meta.json` exists with `status: "beta"`, `category`, and `summary`.
- [ ] Contract tests pass, including the axe test and at least one keyboard test — the
      registry publishes `hasAxeTests` / `hasKeyboardTests` per component; both true.
- [ ] Styles consume tokens only. The registry's "unknown token" warning is empty for
      this component, and `ds/no-primitive-token` passes (semantic tier, not primitives).
- [ ] Exported from the package entry point (or a per-component entry), not deep-imported.

Beta means: teams may use it, the API may still break in a minor, and breakage will be
announced in the changeset.

### beta → stable

Everything beta requires, plus:

- [ ] `summary`, at least one `examples` entry and at least one `doDont` pair in the
      meta file. This mirrors the registry's quality gate exactly — the build warns on
      any stable component missing one of the three.
- [ ] `keyboard` and `a11y` sections filled in (`provides`, `consumerMustProvide`,
      `limitations` — an empty `limitations` is a claim, so state gaps explicitly).
- [ ] Used in at least three places in the product (the registry's adoption count).
- [ ] A VRT baseline committed for its inventory page (the suite picks it up from the
      registry automatically — the checkbox is that the baselines are in the repo).

Stable is a promise, in the registry schema's own words: **no breaking change without
a major and a migration.** Do not mark a component stable to make a status board look
better; the promise is the only thing the word means.

### stable → deprecated

Deprecation follows the packaging skill's policy, restated here verbatim in effect:

1. Mark the export with `@deprecated` JSDoc naming the replacement — the strikethrough
   in the editor is the most effective deprecation channel there is.
2. Set `status: "deprecated"` and a `deprecation` object in the meta file with
   `replacedBy`, `removeIn` (a deprecation with no removal version is a permanent
   fixture) and `migration`.
3. Keep it working for **at least one minor** after the deprecation ships.
4. If the migration is mechanical, ship a codemod in `codemods/transforms/` and name
   it in `deprecation.migration`. If it is not mechanical, the change is bigger than a
   deprecation notice — write a migration guide.
5. Remove only in the named major, in a PR that deletes the codemod's reason to exist,
   not the codemod (people upgrade late).

## Review

- Component PRs: one design system maintainer (routed by `CODEOWNERS`), plus a second
  reviewer for any `stable` API change.
- Status transitions: the transition is the PR — a one-line meta change with the
  checklist above in the description, so the evidence is in the history.
- Visual changes are **at least a minor** and need a changeset saying what moved, even
  when the old rendering was wrong.

## The boring mechanics

```bash
npm run verify        # tokens + typecheck + tests + lint + registry staleness
npm run test:vrt      # visual baselines against the inventory
npm run registry      # regenerate after any meta/props/token change, commit the result
```

CI runs all of it; running it first is the difference between a review about design
and a review about red crosses.
