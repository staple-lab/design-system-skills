---
name: figma-bridge
description: Use when connecting the design system to Figma - pulling Figma variables into the token layer, checking token drift between Figma and code, generating Code Connect mappings from the registry, or pushing the built system into Figma as a library. Triggers on "sync with Figma", "Figma variables", "import tokens from Figma", "Code Connect", "push to Figma", "design tool sync", a figma.com URL in a design-system context.
---

# The Figma bridge

Three flows, in descending order of payoff-per-effort: **pull tokens** (Figma variables →
DTCG), **connect components** (registry → Code Connect), **push a library** (code →
Figma, one-way bootstrap). Each works better with the Figma MCP server connected, and
each has a file-based fallback that works with none.

## The degradation contract — check this first

Probe for the Figma MCP tools (any `mcp__*figma*` / claude.ai Figma tool in the session).

- **Connected** → use the tools: `get_variable_defs` for pulls, the Code Connect tool
  family (`list_file_components_for_code_connect`, `get_code_connect_suggestions`,
  `send_code_connect_mappings`) for mappings, `generate_figma_design` for pushes.
- **Not connected** → say exactly that, and how to fix it: connect the Figma server in
  the client's MCP settings (claude.ai's Figma connector, or Figma's desktop MCP
  server), *or* proceed file-based: any Figma variables JSON export — REST
  `GET /v1/files/:key/variables/local`, a variables-export plugin, Tokens Studio —
  flows through `${CLAUDE_PLUGIN_ROOT}/templates/figma/variables-to-dtcg.mjs` with no
  MCP at all. Never silently skip the Figma work because the tools are absent.

## Flow 1 — pull tokens from Figma variables

```bash
node figma/variables-to-dtcg.mjs variables.json            # write DTCG files
node figma/variables-to-dtcg.mjs variables.json --diff     # report drift, write nothing
node tokens/build.mjs                                      # the gate arbitrates the pull
```

The converter (copy from `${CLAUDE_PLUGIN_ROOT}/templates/figma/`) maps single-mode
collections → `primitive.tokens.json`, multi-mode collections → one
`semantic.<mode>.tokens.json` per mode, aliases → `{dot.path}` references. Full mapping
rules and what does not round-trip: `references/variable-mapping.md`.

The judgement, which the script cannot make:

- **Decide the direction of truth per tier and write it in the config's rationale.**
  The workable contract is: Figma owns primitive *values* (designers tune ramps in the
  tool they live in), code owns semantic *structure* and everything Figma has no concept
  of (density, brands, component knobs, motion). A pull that rewrites your semantic
  layer because a designer renamed a group is not sync, it is a hostile takeover — use
  `--diff` and cherry-pick.
- **The contrast gate arbitrates every pull.** A designer nudging accent lightness in
  Figma can silently kill button-label contrast in code; the gate failing *is* the
  bridge working. Report the failure back to the design side with the measured ratio —
  that number is the argument.
- **`--diff` is the ongoing-sync story.** There is no watch mode and no webhook in this
  bridge on purpose: a scheduled `--diff` (CI cron, exit 1 on drift) that opens a small
  PR beats live sync, because every change lands reviewed and gated. Live token sync
  ships a designer's work-in-progress to production CSS.

## Flow 2 — Code Connect from the registry

Code Connect is what makes Figma's Dev Mode show *your* component's real usage instead
of auto-generated div soup. The registry already holds every component's props, variants
and defaults extracted from the real types — so mappings are a **view over
`registry.json`**, never hand-authored per component (hand-authored mappings are the
docs-drift problem wearing a new hat).

- **MCP path (preferred — zero user-project dependencies):** list the file's components
  (`list_file_components_for_code_connect`), match to registry components by name (take
  `get_code_connect_suggestions` as hints, not truth), send with
  `send_code_connect_mappings`. Confirm the match list with the user before sending —
  a wrong mapping shows false code in every dev's inspect panel.
- **CLI path (fallback, works headless):**
  `node figma/registry-to-codeconnect.mjs --map figma/node-map.json` emits
  `<Name>.figma.tsx` files for `npx figma connect publish` (`@figma/code-connect` is a
  **user-project** dev dependency — never a template one). Without `--map` the files
  carry FIXME URLs: they parse, they document the prop mapping, they will not publish.
  Enum props emit as `figma.enum`, booleans as `figma.boolean` — a starting point to
  adjust, since Figma property names rarely match code prop names exactly.

Regenerate after registry changes; mappings drift exactly as fast as docs otherwise.

## Flow 3 — push the system into Figma (bootstrap, not sync)

For teams whose code is ahead of their design file (common after `/design-system:init`):
generate a Figma library from the built system — Figma's own `figma-generate-library`
skill (served by the MCP server) is the executor; feed it `tokens/dist/tokens.json` for
variables and the registry for the component list, wave 1 first.

Be honest about what this is: **one-way, once**. What survives the trip: variables,
component names, variant grammar, basic anatomy. What does not: interaction states'
exact rendering, motion, responsive behaviour, the escape hatches. After the bootstrap,
the design file is a living artifact with its own history — pushing again overwrites
designer work, so subsequent traffic flows the other way (flow 1 pulls, flow 2 keeps
Dev Mode truthful). If both sides keep evolving independently, the bridge you need is
process (a shared owner for the token layer), not more tooling.

## Verification honesty

The fixture round-trip (variables fixture → DTCG → token build → contrast gate) is
verified automatically by this repo's check script. The MCP flows are **manually
verified against a connected Figma account** — they depend on a live design file and an
authenticated server, so claim exactly that and no more when reporting status.
