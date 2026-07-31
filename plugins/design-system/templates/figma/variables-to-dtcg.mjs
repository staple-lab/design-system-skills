#!/usr/bin/env node
/**
 * Figma variables → DTCG token files.
 *
 * Input (first argument): a JSON file of Figma variables, in either shape:
 *   A. the REST API / plugin shape — { meta: { variableCollections, variables } }
 *      (GET /v1/files/:key/variables/local, or the same object saved from an
 *      MCP session). Collections with ONE mode become theme-independent tokens;
 *      collections with MULTIPLE modes become one semantic file per mode.
 *   B. a flat map — { "color/bg/accent": "#2563EB", ... } (e.g. saved from the
 *      Figma MCP get_variable_defs tool). No modes, no aliases: everything
 *      lands in the primitive file, and theming is a follow-up by hand.
 *
 * Output, into --out (default tokens/): the load-bearing file names the token
 * build dispatches on —
 *   primitive.tokens.json          single-mode collections (values, no references)
 *   semantic.<mode>.tokens.json    multi-mode collections; aliases become {dot.path}
 *
 * Mapping rules live in the figma-bridge skill's references/variable-mapping.md.
 * The short version: `/` paths → dot paths (segments kebab-cased), COLOR → hex,
 * FLOAT → dimension px (except z/opacity/font-weight heads → plain number),
 * aliases → references to the target variable's mapped path. BOOLEAN and STRING
 * variables are skipped with a note — they are usually component logic, not
 * design tokens.
 *
 * Modes:
 *   --diff   compare against the existing files in --out and report
 *            "Figma says X, code says Y" per token WITHOUT writing. Exit 1 if
 *            drift found (usable as a sync check in CI).
 *   --write  write the files (default if --diff not given)
 *
 * After writing: node tokens/build.mjs — the contrast gate arbitrates the pull.
 * Dependency-free Node ESM.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const argv = process.argv.slice(2);
const input = argv.find((a) => !a.startsWith('--'));
const diffMode = argv.includes('--diff');
let outDir = 'tokens';
{ const i = argv.indexOf('--out'); if (i !== -1) outDir = argv[i + 1]; }

if (!input) {
  console.error('Usage: node variables-to-dtcg.mjs <figma-variables.json> [--out tokens/] [--diff]');
  process.exit(1);
}

const raw = JSON.parse(readFileSync(input, 'utf8'));

// ---------------------------------------------------------------------------
// Normalisation helpers
// ---------------------------------------------------------------------------

const NUMBER_HEADS = new Set(['z', 'opacity', 'font-weight']);

function toDotPath(figmaName) {
  return figmaName
    .split('/')
    .map((seg) => seg.trim().replace(/\s+/g, '-').toLowerCase())
    .filter(Boolean)
    .join('.');
}

function colorToHex({ r, g, b, a = 1 }) {
  const h = (v) => Math.round(Math.min(1, Math.max(0, v)) * 255).toString(16).padStart(2, '0');
  return a >= 1 ? `#${h(r)}${h(g)}${h(b)}` : `#${h(r)}${h(g)}${h(b)}${h(a)}`;
}

function floatToValue(dotPath, n) {
  const head = dotPath.split('.')[0];
  if (NUMBER_HEADS.has(head)) return { $type: 'number', $value: n };
  return { $type: 'dimension', $value: { value: n, unit: 'px' } };
}

function setPath(doc, dotPath, token) {
  const segs = dotPath.split('.');
  let node = doc;
  for (const s of segs.slice(0, -1)) node = node[s] ??= {};
  node[segs.at(-1)] = token;
}

// ---------------------------------------------------------------------------
// Convert
// ---------------------------------------------------------------------------

const skipped = [];
const docs = {}; // filename → DTCG doc

if (raw?.meta?.variables && raw?.meta?.variableCollections) {
  // Shape A — collections + modes + aliases
  const collections = raw.meta.variableCollections;
  const variables = raw.meta.variables;
  const pathById = {};
  for (const v of Object.values(variables)) pathById[v.id] = toDotPath(v.name);

  for (const v of Object.values(variables)) {
    const col = collections[v.variableCollectionId];
    if (!col) { skipped.push(`${v.name}: unknown collection`); continue; }
    const dotPath = toDotPath(v.name);
    const modes = col.modes ?? [{ modeId: col.defaultModeId, name: 'value' }];
    const multiMode = modes.length > 1;

    for (const mode of modes) {
      const value = v.valuesByMode?.[mode.modeId];
      if (value === undefined) { skipped.push(`${v.name}: no value for mode ${mode.name}`); continue; }
      const file = multiMode
        ? `semantic.${mode.name.trim().replace(/\s+/g, '-').toLowerCase()}.tokens.json`
        : 'primitive.tokens.json';
      const doc = docs[file] ??= {};

      let token;
      if (value && typeof value === 'object' && value.type === 'VARIABLE_ALIAS') {
        const target = pathById[value.id];
        if (!target) { skipped.push(`${v.name}: alias to unknown variable ${value.id}`); continue; }
        token = { $type: v.resolvedType === 'COLOR' ? 'color' : 'dimension', $value: `{${target}}` };
      } else if (v.resolvedType === 'COLOR') {
        token = { $type: 'color', $value: colorToHex(value) };
      } else if (v.resolvedType === 'FLOAT') {
        token = floatToValue(dotPath, value);
      } else {
        skipped.push(`${v.name}: ${v.resolvedType} — booleans/strings are usually component logic, not tokens`);
        continue;
      }
      if (v.description) token.$description = v.description;
      setPath(doc, dotPath, token);
    }
  }
} else if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
  // Shape B — flat name → value map (single mode, no aliases)
  const doc = docs['primitive.tokens.json'] = {};
  for (const [name, value] of Object.entries(raw)) {
    const dotPath = toDotPath(name);
    if (typeof value === 'string' && (/^#|^rgb|^hsl|^oklch/.test(value.trim()))) {
      setPath(doc, dotPath, { $type: 'color', $value: value.trim() });
    } else if (typeof value === 'number') {
      setPath(doc, dotPath, floatToValue(dotPath, value));
    } else if (typeof value === 'string' && /^-?\d+(\.\d+)?px$/.test(value.trim())) {
      setPath(doc, dotPath, { $type: 'dimension', $value: { value: parseFloat(value), unit: 'px' } });
    } else {
      skipped.push(`${name}: unrecognised value ${JSON.stringify(value)}`);
    }
  }
} else {
  console.error('✗ input is neither the REST variables shape ({meta:{variables,…}}) nor a flat name→value map');
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Diff or write
// ---------------------------------------------------------------------------

function flatten(doc, prefix = '', out = {}) {
  for (const [k, v] of Object.entries(doc)) {
    if (k.startsWith('$')) continue;
    if (v && typeof v === 'object' && '$value' in v) out[prefix ? `${prefix}.${k}` : k] = v.$value;
    else if (v && typeof v === 'object') flatten(v, prefix ? `${prefix}.${k}` : k, out);
  }
  return out;
}

const fmt = (v) => (typeof v === 'object' ? JSON.stringify(v) : String(v));

if (diffMode) {
  let drift = 0, missing = 0;
  for (const [file, doc] of Object.entries(docs)) {
    const target = join(outDir, file);
    const theirs = flatten(doc);
    const ours = existsSync(target) ? flatten(JSON.parse(readFileSync(target, 'utf8'))) : {};
    for (const [path, figmaVal] of Object.entries(theirs)) {
      if (!(path in ours)) { console.log(`+ ${file} ${path}: in Figma (${fmt(figmaVal)}), not in code`); missing++; }
      else if (fmt(ours[path]).toLowerCase() !== fmt(figmaVal).toLowerCase()) {
        console.log(`≠ ${file} ${path}: Figma says ${fmt(figmaVal)}, code says ${fmt(ours[path])}`);
        drift++;
      }
    }
    for (const path of Object.keys(ours)) {
      if (!(path in theirs)) console.log(`- ${file} ${path}: in code, not in Figma (code-only tokens are fine — density, brand, component knobs rarely live in Figma)`);
    }
  }
  console.log(`\n${drift} value drift(s), ${missing} Figma-only token(s)${skipped.length ? `, ${skipped.length} skipped` : ''}`);
  process.exit(drift ? 1 : 0);
} else {
  mkdirSync(outDir, { recursive: true });
  for (const [file, doc] of Object.entries(docs)) {
    writeFileSync(join(outDir, file), JSON.stringify(doc, null, 2) + '\n');
    console.log(`✓ ${join(outDir, file)} (${Object.keys(flatten(doc)).length} tokens)`);
  }
  for (const s of skipped) console.warn(`  ! skipped ${s}`);
  console.log('\nNow run: node tokens/build.mjs — the contrast gate arbitrates the pull.');
}
