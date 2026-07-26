# Codemods

**Every deprecation ships a mechanical migration.** That is the whole model, and it is
the one Carbon (`@carbon/upgrade`) and Polaris (`polaris-migrator`) proved at scale: a
deprecation notice asks hundreds of people to each do the same edit by hand; a codemod
does the edit once, correctly, everywhere. If a migration cannot be expressed as a
codemod, that is a signal the API change is bigger than it looks — say so in the
changeset instead of pretending a docs note covers it.

The deprecation policy this serves (see CONTRIBUTING.md): mark with `@deprecated`
JSDoc, keep the old API working for at least one minor, ship the codemod, name the
removal version.

## Layout

```
codemods/
  bin/codemod.mjs        runner — jscodeshift with the defaults this repo always wants
  transforms/*.cjs       one file per migration, named for what it does
```

## Running one

```bash
# dry run first — -d prints which files WOULD change, -p prints the output
npm run codemod -- rename-prop src/ -d -p --component=Button --from=leftIcon --to=startIcon

# then for real
npm run codemod -- rename-prop src/ --component=Button --from=leftIcon --to=startIcon
```

The runner passes `--parser=tsx`, `--extensions=tsx,ts,jsx,js` and ignores
`node_modules` and `dist` for you; anything after the transform name and paths goes
straight through to jscodeshift, so all of its flags work.

## Writing one

- One transform per migration, named for the change (`button-variant-rename.cjs`), not
  for the release ("v3-migration" transforms grow forever and can never be deleted).
- Return `null` when a file is untouched — jscodeshift then leaves it byte-identical
  instead of reprinting it, which keeps the diff reviewable.
- Codemods see syntax, not semantics. `<Button {...props}>` can smuggle a renamed prop
  past any transform, and so can a wrapper component. State what the transform does
  NOT catch in its header comment, and grep for the old name after running.
- Test against a fixture: put the before-state in a scratch file, run with `-d -p`,
  read the printed output. A codemod that mangles code is worse than no codemod —
  it destroys the trust that makes people willing to run the next one.

`transforms/rename-prop.cjs` is the worked example: parameterised, spread-aware in its
warnings, and small enough to copy as the starting point for the next one.
