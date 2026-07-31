---
description: Bridge the design system and Figma — pull variables into the token layer, generate Code Connect mappings from the registry, or push the system into Figma as a library
argument-hint: "['pull tokens', 'diff tokens', 'connect components', 'push library', or a figma.com URL]"
---

# Figma bridge

Request: `$ARGUMENTS`

Invoke the `figma-bridge` skill — it owns the judgement (direction-of-truth per tier,
the diff-not-live-sync position, Code Connect as a registry view, push-as-bootstrap).
Work from `design-system.config.json`; if there is none, offer `/design-system:init`.

**First, the probe.** Check whether Figma MCP tools are available in this session. If
not, say so, explain how to connect the server, and offer the file-based fallback for
pulls/diffs (a variables JSON export) — per the skill's degradation contract. Do not
silently skip Figma-side steps.

Then dispatch on the request:

- **Pull / diff tokens** — get variables (MCP `get_variable_defs`, or the user's
  exported JSON file), save the JSON, run
  `${CLAUDE_PLUGIN_ROOT}/templates/figma/variables-to-dtcg.mjs` (copy into the
  project's `figma/` if absent). Always run `--diff` first and show the drift report;
  on a real pull, run `node tokens/build.mjs` and treat a contrast-gate failure as a
  finding to report back to the design side with the measured ratio. Never overwrite
  the semantic layer wholesale from a pull — cherry-pick per the skill.
- **Connect components** — registry must exist (else run the registry build). MCP
  connected: list file components, match to registry by name, confirm the match list
  with the user, then `send_code_connect_mappings`. No MCP:
  `node figma/registry-to-codeconnect.mjs [--map figma/node-map.json]` and hand the
  user the `figma connect publish` step (`@figma/code-connect` is their dev dependency,
  not the template's).
- **Push library** — MCP required (there is no file fallback for creating Figma
  documents). Confirm scope with the user first — push is a one-way bootstrap that can
  overwrite designer work in an existing file; prefer a new file. Feed Figma's
  `figma-generate-library` skill the built `tokens/dist/tokens.json` and the registry's
  component list, wave 1 first. Report honestly what did not survive the trip (the
  skill lists it).

Verification per the skill's honesty rule: fixture-covered paths report as verified;
MCP-dependent paths report as "ran against the connected account" or "not run" — never
as more than they are.
