# CLAUDE.md — design-system-skills working guide

Read this before changing anything in this repo.

## What this is

A **Claude Code marketplace** containing one plugin, `design-system`, which builds and
maintains production React design systems. The audience is two-sided: the humans who own
a design system, and the AI agents that write code against it.

This repo contains **no application code**. It ships instructions (skills, commands,
agents) and **executable templates**. Those two categories have different rules.

```
.claude-plugin/marketplace.json      the marketplace manifest
plugins/design-system/
  .claude-plugin/plugin.json         the plugin manifest
  commands/*.md                      8 slash commands → /design-system:<name>
  skills/<name>/SKILL.md             13 skills (+ references/ where a skill needs depth)
  agents/*.md                        2 subagent definitions
  templates/                         the scaffolding the skills copy into user projects
```

## The one architectural idea

Everything the plugin generates hangs off a single machine-readable registry:

```
design-system.config.json  +  tokens/*.tokens.json  +  TS types
                    │
                    ▼  generated, never hand-written
            .design-system/registry.json
                    │
      ┌─────────────┼──────────────┬───────────────┐
      ▼             ▼              ▼               ▼
  inventory     AGENTS.md       lint rules      test matrix
```

**Docs drift from code because they get written twice.** If you are about to add a fact to
the inventory site, the lint rules or `AGENTS.md`, ask whether it belongs in the registry
instead. Adding a fourth thing that reads the registry is right; adding a second place a
fact is authored is wrong.

## Rules for `templates/`

These files are **executed**, not read as prose. They are the tested versions, and they
have had real bugs fixed in them that a fresh rewrite would reintroduce.

- **Both build scripts are dependency-free Node ESM, and must stay that way.** They run in
  CI, in a pre-commit hook, and on a designer's machine that has never run `npm install`.
  Do not add an import that needs `node_modules`. `react-docgen-typescript` is the one
  exception and it is loaded via optional dynamic import with a working fallback.
- **Run them before committing.** They take seconds and they run standalone:

  ```bash
  cd plugins/design-system/templates

  # token engine, across every CSS system it claims to support
  for s in css-modules tailwind vanilla-extract stylex panda; do
    echo "{\"stack\":{\"cssSystem\":\"$s\"}}" > /tmp/ds/design-system.config.json
    node tokens/build.mjs || exit 1
  done

  # the contrast gate must FAIL on a bad pair — verify the negative case too
  # (break color.fg.on-accent, confirm exit 1, restore)

  # registry builder, against a scratch project with a component in it
  node scripts/build-registry.mjs && node scripts/build-registry.mjs --check
  ```

  Copy the templates into a scratch directory to run them — **never leave a generated
  `tokens/dist/` or `.design-system/` inside `templates/`.**

- **The lint plugin has no test harness dependency.** Its rules are plain objects; drive
  `rule.create(fakeContext)` visitors directly with hand-built nodes. That is how the
  "primitive token suggested for a raw hex" bug was caught.
- **`templates/workflows/*.mjs` are Workflow scripts, not Node scripts.** They are executed
  by the `Workflow` tool, so they use its globals (`agent`, `parallel`, `phase`, `log`,
  `args`) and combine `export const meta` with a top-level `return` — which is neither valid
  ESM nor valid CJS, so `node --check` rejects them as written. Syntax-check by stripping the
  `export` and wrapping the body:

  ```bash
  { echo '(async () => {'; sed 's/^export const meta/const meta/' <file>; echo '})()'; } \
    | node --check /dev/stdin
  ```

  Two constraints that are easy to violate and fail only at run time: `meta` must be a
  **pure literal** (no variables, calls, spreads or interpolation), and `Date.now()`,
  `new Date()` and `Math.random()` throw inside a workflow — they would break resume.
  Every `phase()` title must have a matching entry in `meta.phases`.
- **TSX templates must at least parse.** There is no `node_modules` here, so:

  ```bash
  tsc --noEmit --noResolve --jsx react-jsx --target es2022 --skipLibCheck <files>
  ```

  Ignore `Cannot find module`, `react/jsx-runtime`, and `import.meta.glob` errors — those
  are the absent dependencies. Anything else is a real defect.

## Rules for skills and commands

- **Frontmatter**: every `SKILL.md` and agent needs `name` (matching its directory or
  filename) and a `description` written in *trigger* terms — the situations and phrases
  that should load it, not a summary of the contents. Commands need `description`.
- **Reference templates by path, don't inline them.** Use
  `${CLAUDE_PLUGIN_ROOT}/templates/...`. A code block in a skill that duplicates a
  template will diverge from it.
- **Skills carry judgement, templates carry code.** If a skill is turning into a long code
  listing, that listing is a template.
- **Be specific and falsifiable.** "Use good contrast" is worthless; "step 600 at L 0.565
  gives white text 4.66:1, and L 0.600 gives 4.03:1 and fails" is the thing worth writing
  down. Numbers, trade-offs, and the failure mode being prevented.
- **State both sides of a trade-off.** These skills tell people what to commit to for
  years. Where a choice is genuinely contested (Storybook vs a custom inventory, package
  vs in-repo), say what each costs rather than picking silently.

## Verifying a change

```bash
node scripts/check-plugin.mjs
```

One script, run it after any change: frontmatter + manifest consistency, template-path
resolution (including the inverse — a reference file mentioned by nothing is a failure),
and the template smoke runs from the section above (token engine × 5 CSS systems, the
negative contrast case, registry build, importer failure mode, TSX parse gate when `tsc`
is on PATH). CI (`.github/workflows/check.yml`) runs it on every push, plus the palette
importer's positive path against real `tailwindcss` / `@radix-ui/colors` installs.

Every `${CLAUDE_PLUGIN_ROOT}` path referenced in a skill or command must exist. A dangling
reference fails silently at use time, which is the worst possible time.

## Factual currency

The skills name specific packages, versions and APIs. They were written against **July
2026** — Base UI stable as `@base-ui/react` (note the rename from
`@base-ui-components/react`), shadcn CLI v4 with `--base`, Tailwind v4's CSS-first
`@theme`, DTCG format module stable at 2025.10, Storybook's Vitest addon superseding
`@storybook/test-runner`, `react-aria-components` 3.x.

**Verify before updating any of these — do not refresh them from memory.** A confidently
wrong package name is worse than an outdated one, because it fails at install time in
someone else's repo.

## Commits

- Remote: `github.com/staple-lab/design-system-skills` (`origin`).
- Imperative summary + bullets.
- Stage explicitly. Do not `git add -A`.
- Commit and push only when asked.
