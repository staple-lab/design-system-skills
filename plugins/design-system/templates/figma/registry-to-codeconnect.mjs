#!/usr/bin/env node
/**
 * Registry → Code Connect files.
 *
 * Reads .design-system/registry.json (props, variants, defaults are already
 * extracted there from the real types — this script is a pure view over it,
 * same as the inventory and AGENTS.md) and emits one <Name>.figma.tsx per
 * component for the `@figma/code-connect` CLI.
 *
 *   node figma/registry-to-codeconnect.mjs [--map figma/node-map.json] [--out figma/connect]
 *
 * --map is a JSON file of { "Button": "https://www.figma.com/design/...?node-id=1-23", ... }.
 * Components without a mapped URL are emitted with a FIXME placeholder — the
 * file parses and documents the intended prop mapping, but `figma connect
 * publish` will reject it until the URL is real. Getting URLs is a design-file
 * operation: via the Figma MCP server (get_code_connect_map /
 * list_file_components_for_code_connect) or by copying links in Figma.
 *
 * Prop mapping heuristics (adjust the emitted file, it is a starting point):
 *   enum-typed prop (registry `values`)   → figma.enum('<Prop>', { value: value })
 *   boolean prop                          → figma.boolean('<Prop>')
 *   children / ReactNode                  → figma.children('*') / figma.string('Label')
 *   everything else                       → left out (Code Connect maps what varies in Figma)
 *
 * Note: if the Figma MCP server is connected, prefer sending mappings directly
 * (send_code_connect_mappings) — no files, no CLI, no user-project dependency.
 * These files are the fallback for teams publishing via the CLI in CI.
 * Dependency-free Node ESM.
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const argv = process.argv.slice(2);
let outDir = join('figma', 'connect');
let mapPath = null;
{
  const o = argv.indexOf('--out'); if (o !== -1) outDir = argv[o + 1];
  const m = argv.indexOf('--map'); if (m !== -1) mapPath = argv[m + 1];
}

const regPath = join('.design-system', 'registry.json');
if (!existsSync(regPath)) {
  console.error(`✗ ${regPath} not found — run the registry build first (node scripts/build-registry.mjs)`);
  process.exit(1);
}
const registry = JSON.parse(readFileSync(regPath, 'utf8'));
const nodeMap = mapPath ? JSON.parse(readFileSync(mapPath, 'utf8')) : {};

// The registry stores enums as the union type string ("'primary' | 'ghost'"),
// exactly as extracted from the source. Parse the literal values back out.
const enumValues = (p) => {
  if (typeof p.type !== 'string' || !/^'[^']*'(\s*\|\s*'[^']*')+$/.test(p.type.trim())) return null;
  return [...p.type.matchAll(/'([^']*)'/g)].map((m) => m[1]);
};
const isBool = (p) => p.type === 'boolean';

mkdirSync(outDir, { recursive: true });
let written = 0, placeholders = 0;

for (const c of registry.components ?? []) {
  if (c.status === 'deprecated') continue;
  const url = nodeMap[c.name];
  if (!url) placeholders++;

  const enums = (c.props ?? []).map((p) => ({ ...p, values: enumValues(p) })).filter((p) => p.values);
  const bools = (c.props ?? []).filter((p) => isBool(p) && !/^(as|render)/.test(p.name));
  const hasChildren = (c.props ?? []).some((p) => p.name === 'children');

  const propLines = [
    ...enums.map((p) =>
      `    ${p.name}: figma.enum('${cap(p.name)}', {\n${p.values.map((v) => `      '${cap(v)}': '${v}',`).join('\n')}\n    }),`),
    ...bools.map((p) => `    ${p.name}: figma.boolean('${cap(p.name)}'),`),
    ...(hasChildren ? [`    children: figma.string('Label'),`] : []),
  ];
  const exampleProps = [...enums, ...bools].map((p) => `${p.name}={props.${p.name}}`).join(' ');

  const src = `// Generated from .design-system/registry.json by figma/registry-to-codeconnect.mjs.
// Regenerate after registry changes; hand-edits below the props block survive review, not regeneration.
import figma from '@figma/code-connect';
import { ${c.name} } from '${registry.package?.name ?? '../..'}';

figma.connect(${c.name}, '${url ?? `FIXME://paste-the-figma-component-url-for-${c.name}`}', {
  props: {
${propLines.join('\n') || '    // no enum/boolean props extracted — map what varies in Figma'}
  },
  example: (props) => <${c.name} ${exampleProps}${hasChildren ? '>{props.children}</' + c.name + '>' : ' />'},
});
`;
  writeFileSync(join(outDir, `${c.name}.figma.tsx`), src);
  written++;
}

function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

console.log(`✓ ${written} Code Connect file(s) in ${outDir}${placeholders ? ` — ${placeholders} with FIXME URLs (pass --map, or use the Figma MCP tools to resolve node URLs)` : ''}`);
