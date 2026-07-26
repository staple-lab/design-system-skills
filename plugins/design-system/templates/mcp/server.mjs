#!/usr/bin/env node
/**
 * Design-system MCP server — the registry and tokens, served over the Model
 * Context Protocol so any MCP client (Claude Code, Cursor, …) can query the
 * system instead of guessing component and token names.
 *
 * Dependency-free on purpose, like the two build scripts: JSON-RPC 2.0 over
 * stdio with newline-delimited framing (the standard MCP stdio transport).
 * No SDK, no node_modules — it runs on a machine that never ran npm install.
 *
 * It serves GENERATED artifacts, it does not generate them:
 *
 *   .design-system/registry.json   ← npm run registry
 *   tokens/dist/tokens.json        ← npm run tokens
 *   AGENTS.md                      ← npm run registry (--agents / ai.generateAgentsMd)
 *
 * Usage: node mcp/server.mjs [--root <project-root>]
 *   --root  where to find the artifacts (default: cwd)
 */

import { readFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { createInterface } from 'node:readline';

const rootIdx = process.argv.indexOf('--root');
const ROOT = resolve(rootIdx > 0 && process.argv[rootIdx + 1] ? process.argv[rootIdx + 1] : process.cwd());

const config = existsSync(join(ROOT, 'design-system.config.json'))
  ? JSON.parse(readFileSync(join(ROOT, 'design-system.config.json'), 'utf8'))
  : {};

const PATHS = {
  registry: config.paths?.registry ?? '.design-system/registry.json',
  tokens: join(config.paths?.tokens ?? 'tokens', 'dist', 'tokens.json'),
  agents: 'AGENTS.md',
};

// The versions this server implements. Per the MCP spec: echo the client's
// version when we support it, otherwise answer with our latest and let the
// client decide whether to proceed.
const PROTOCOL_VERSIONS = ['2025-06-18', '2025-03-26', '2024-11-05'];

const SERVER_INFO = { name: config.name ?? 'design-system', version: config.version ?? '0.0.0' };

// ---------------------------------------------------------------------------
// tools
// ---------------------------------------------------------------------------

const TOOLS = [
  {
    name: 'search_components',
    description:
      'Search the design system component registry by name, synonym, summary or category. ' +
      'Returns each match with status, summary and use-for / don’t-use-for guidance. ' +
      'Call this BEFORE building any UI element — if a component exists, use it rather than hand-rolling one.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'What you need, e.g. "button", "cta", "date picker", "overlay"' },
      },
      required: ['query'],
    },
  },
  {
    name: 'get_component',
    description:
      'Fetch the full registry entry for one component: props with types and defaults, keyboard map, ' +
      'a11y contract, do/don’t guidance, tokens consumed, and copy-pasteable examples.',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Component name as listed by search_components, e.g. "Button"' },
      },
      required: ['name'],
    },
  },
  {
    name: 'search_tokens',
    description:
      'Search the design tokens by path or description. Returns each token’s value per theme, tier ' +
      '(primitive | semantic | component) and description. Components must use SEMANTIC tokens — ' +
      'never raw values, never primitives.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Substring of the token path or description, e.g. "bg.accent", "space", "focus ring"' },
        tier: { type: 'string', enum: ['primitive', 'semantic', 'component'], description: 'Optional tier filter' },
      },
      required: ['query'],
    },
  },
  {
    name: 'get_guidelines',
    description:
      'The generated AGENTS.md — the house rules for writing code against this design system ' +
      '(token usage, imports, focus, a11y) plus the component table. Read it once per session before writing UI code.',
    inputSchema: { type: 'object', properties: {} },
  },
];

/** A tool-level failure: reported inside the result with isError, not as a protocol error. */
class ToolError extends Error {}

function loadJson(relPath, regenerate) {
  const p = join(ROOT, relPath);
  if (!existsSync(p)) {
    throw new ToolError(`${relPath} not found under ${ROOT}. This server reads generated artifacts — run \`${regenerate}\` first.`);
  }
  return JSON.parse(readFileSync(p, 'utf8'));
}

function searchComponents({ query }) {
  const registry = loadJson(PATHS.registry, 'npm run registry');
  const q = String(query ?? '').toLowerCase().trim();
  if (!q) throw new ToolError('query must be a non-empty string.');

  const hits = registry.components.filter((c) =>
    [c.name, c.summary, c.category, ...(c.synonyms ?? [])].some((s) => String(s ?? '').toLowerCase().includes(q)),
  );
  if (!hits.length) {
    return `No component matches "${query}". Available: ${registry.components.map((c) => c.name).join(', ')}. If nothing fits, say so rather than building a one-off.`;
  }
  return hits.map((c) => ({
    name: c.name,
    status: c.status,
    summary: c.summary,
    useFor: c.useFor,
    dontUseFor: c.dontUseFor,
    sourcePath: c.sourcePath,
  }));
}

function getComponent({ name }) {
  const registry = loadJson(PATHS.registry, 'npm run registry');
  const q = String(name ?? '').toLowerCase().trim();
  const hit =
    registry.components.find((c) => c.name.toLowerCase() === q) ??
    registry.components.find((c) => (c.synonyms ?? []).some((s) => s.toLowerCase() === q));
  if (!hit) {
    throw new ToolError(`No component named "${name}". Available: ${registry.components.map((c) => c.name).join(', ')}.`);
  }
  return hit;
}

function searchTokens({ query, tier }) {
  const tokens = loadJson(PATHS.tokens, 'npm run tokens');
  const q = String(query ?? '').toLowerCase().trim();
  if (!q) throw new ToolError('query must be a non-empty string.');

  // Collate per token path across themes so one result shows every theme's value.
  const byPath = new Map();
  for (const [theme, entries] of Object.entries(tokens.themes ?? {})) {
    for (const [path, t] of Object.entries(entries)) {
      const row = byPath.get(path) ?? { name: path, value: {}, tier: t.tier, description: t.description ?? '', cssVar: t.var };
      row.value[theme] = t.hex ?? t.value;
      byPath.set(path, row);
    }
  }

  const hits = [...byPath.values()].filter(
    (t) => (!tier || t.tier === tier) && (t.name.toLowerCase().includes(q) || t.description.toLowerCase().includes(q)),
  );
  if (!hits.length) return `No token matches "${query}"${tier ? ` in tier ${tier}` : ''}.`;
  // Cap the flood: a query like "color" can match hundreds of tokens.
  return hits.length > 100 ? { total: hits.length, showing: 100, tokens: hits.slice(0, 100) } : hits;
}

function getGuidelines() {
  const p = join(ROOT, PATHS.agents);
  if (!existsSync(p)) {
    throw new ToolError(`${PATHS.agents} not found under ${ROOT}. Run \`npm run registry\` (with --agents or ai.generateAgentsMd) first.`);
  }
  return readFileSync(p, 'utf8');
}

const HANDLERS = {
  search_components: searchComponents,
  get_component: getComponent,
  search_tokens: searchTokens,
  get_guidelines: getGuidelines,
};

// ---------------------------------------------------------------------------
// JSON-RPC over stdio, newline-delimited
// ---------------------------------------------------------------------------

function send(msg) {
  process.stdout.write(JSON.stringify(msg) + '\n');
}

function reply(id, result) {
  send({ jsonrpc: '2.0', id, result });
}

function replyError(id, code, message) {
  send({ jsonrpc: '2.0', id, error: { code, message } });
}

function handleRequest(msg) {
  const { id, method, params = {} } = msg;

  switch (method) {
    case 'initialize': {
      const requested = params.protocolVersion;
      reply(id, {
        protocolVersion: PROTOCOL_VERSIONS.includes(requested) ? requested : PROTOCOL_VERSIONS[0],
        capabilities: { tools: {} },
        serverInfo: SERVER_INFO,
      });
      return;
    }
    case 'ping':
      reply(id, {});
      return;
    case 'tools/list':
      reply(id, { tools: TOOLS });
      return;
    case 'tools/call': {
      const handler = HANDLERS[params.name];
      if (!handler) {
        replyError(id, -32602, `Unknown tool: ${params.name}. Available: ${Object.keys(HANDLERS).join(', ')}`);
        return;
      }
      try {
        const out = handler(params.arguments ?? {});
        const text = typeof out === 'string' ? out : JSON.stringify(out, null, 2);
        reply(id, { content: [{ type: 'text', text }] });
      } catch (err) {
        // Tool failures (missing artifacts, unknown component) go back IN BAND so the
        // model can read them and self-correct; only protocol misuse is a JSON-RPC error.
        if (err instanceof ToolError || err instanceof SyntaxError) {
          reply(id, { content: [{ type: 'text', text: err.message }], isError: true });
        } else {
          replyError(id, -32603, `Internal error: ${err.message}`);
        }
      }
      return;
    }
    default:
      replyError(id, -32601, `Method not found: ${method}`);
  }
}

function handleMessage(msg) {
  if (msg === null || typeof msg !== 'object' || Array.isArray(msg) || msg.jsonrpc !== '2.0') {
    if (msg && typeof msg === 'object' && !Array.isArray(msg) && msg.id !== undefined) {
      replyError(msg.id, -32600, 'Invalid request');
    }
    return;
  }
  if (msg.method === undefined) return; // a response to a server-initiated request; we send none
  if (msg.id === undefined) return; // notification (notifications/initialized, cancelled, …) — accept silently
  handleRequest(msg);
}

const rl = createInterface({ input: process.stdin, terminal: false });
rl.on('line', (line) => {
  const trimmed = line.trim();
  if (!trimmed) return;
  let msg;
  try {
    msg = JSON.parse(trimmed);
  } catch {
    replyError(null, -32700, 'Parse error');
    return;
  }
  handleMessage(msg);
});
rl.on('close', () => process.exit(0)); // client hung up — exit rather than linger

console.error(`design-system MCP server: stdio, root ${ROOT}`);
