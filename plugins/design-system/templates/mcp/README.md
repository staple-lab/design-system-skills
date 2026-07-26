# Design-system MCP server

A [Model Context Protocol](https://modelcontextprotocol.io) server that lets any MCP client
(Claude Code, Cursor, …) query the design system — components, tokens, house rules — instead
of guessing names and hardcoding hexes.

**Dependency-free Node ESM**, like the two build scripts: JSON-RPC 2.0 over stdio with
newline-delimited framing, no SDK, no `node_modules`. It runs on a machine that has never
run `npm install`.

## What it serves

It reads the **generated artifacts**, it does not generate them:

| Artifact | Produced by |
|---|---|
| `.design-system/registry.json` | `npm run registry` |
| `tokens/dist/tokens.json` | `npm run tokens` |
| `AGENTS.md` | `npm run registry` (with `--agents` or `ai.generateAgentsMd`) |

So `npm run tokens && npm run registry` must have run at least once, and the answers are only
as current as the last run. A missing artifact comes back as an in-band tool error telling the
model which command to run — the server never crashes over it.

## Registering it in Claude Code

Add to the project's `.mcp.json`:

```json
{
  "mcpServers": {
    "design-system": {
      "command": "node",
      "args": ["mcp/server.mjs"]
    }
  }
}
```

Claude Code launches the server from the project root, which is where the artifacts live. If
you launch it from anywhere else, pass the project root explicitly:
`node mcp/server.mjs --root /path/to/project`. There is also an npm script: `npm run mcp`.

## Tools

| Tool | Arguments | Returns |
|---|---|---|
| `search_components` | `query` | Matches on name / synonyms / summary / category → name, status, summary, use-for / don't-use-for, source path |
| `get_component` | `name` | The full registry entry: props, keyboard map, a11y contract, do/don't, tokens consumed, examples |
| `search_tokens` | `query`, optional `tier` (`primitive` \| `semantic` \| `component`) | Token name, value per theme, tier, description |
| `get_guidelines` | — | The generated `AGENTS.md` — the house rules |

## Smoke test

Newline-delimited JSON in, newline-delimited JSON out:

```bash
printf '%s\n' \
  '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"smoke","version":"0"}}}' \
  '{"jsonrpc":"2.0","method":"notifications/initialized"}' \
  '{"jsonrpc":"2.0","id":2,"method":"tools/list"}' \
  '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"search_components","arguments":{"query":"button"}}}' \
  | node mcp/server.mjs
```
