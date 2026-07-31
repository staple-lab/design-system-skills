'use strict';

const { readFileSync } = require('node:fs');

/**
 * Rewrites hardcoded style values in JS/TSX to token var() references, driven
 * by the value map that adopt/infer-tokens.mjs produced:
 *
 *   node adopt/infer-tokens.mjs            # writes .design-system/adopt/value-map.json
 *   npm run codemod -- value-to-token src/ --map=.design-system/adopt/value-map.json
 *
 * Only EXACT-confidence entries are applied — a "nearest" or "snap" match is a
 * migration decision (the value visibly changes), which belongs in the adoption
 * plan, not in a mechanical rewrite. Pass --include-snap to also apply "snap"
 * dimension entries (visible change of a few px, listed per file afterwards).
 *
 * What it rewrites:
 *   - inline style objects:  style={{ color: '#2563eb' }}  →  'var(--ds-color-accent-600)'
 *     and numeric dimensions: style={{ padding: 16 }}      →  'var(--ds-space-4)'
 *   - CSS-in-JS template literals: color: #2563eb;          →  color: var(--ds-color-accent-600);
 *
 * What it does NOT catch — grep for the literals after running:
 *   - values computed at runtime (`padding: gutter * 2`)
 *   - plain .css files (use infer-tokens.mjs --rewrite-css for those)
 *   - shorthand strings ('1px solid #2563eb' inside a JS string is rewritten
 *     only when the whole string is the colour)
 */
module.exports = function valueToToken(file, api, options) {
  const j = api.jscodeshift;
  const mapPath = options.map ?? '.design-system/adopt/value-map.json';
  const includeSnap = Boolean(options['include-snap']);

  let entries;
  try {
    entries = JSON.parse(readFileSync(mapPath, 'utf8')).entries;
  } catch (e) {
    throw new Error(`value-to-token: cannot read ${mapPath} — run adopt/infer-tokens.mjs first (${e.message})`);
  }

  const wanted = entries.filter((e) =>
    e.var && (e.confidence === 'exact' || (includeSnap && e.confidence === 'snap')));
  const colorByLiteral = new Map();
  const pxByNumber = new Map();
  for (const e of wanted) {
    if (e.kind === 'color') colorByLiteral.set(e.literal.toLowerCase(), e.var);
    if (e.kind === 'dimension') pxByNumber.set(parseFloat(e.literal), e.var);
  }

  const STYLE_DIMENSION_KEYS = /^(margin|padding|gap|top|right|bottom|left|inset|width|height|minWidth|maxWidth|minHeight|maxHeight|rowGap|columnGap|borderRadius)/;

  const root = j(file.source);
  let changed = 0;

  // Inline style objects and any object literal with style-shaped keys
  root.find(j.ObjectProperty).forEach((path) => {
    const key = path.node.key;
    const keyName = key.type === 'Identifier' ? key.name : key.type === 'StringLiteral' ? key.value : null;
    if (!keyName) return;
    const v = path.node.value;
    if (v.type === 'StringLiteral') {
      const token = colorByLiteral.get(v.value.trim().toLowerCase());
      if (token) { path.node.value = j.stringLiteral(`var(${token})`); changed++; }
    } else if (v.type === 'NumericLiteral' && STYLE_DIMENSION_KEYS.test(keyName)) {
      const token = pxByNumber.get(v.value);
      if (token) { path.node.value = j.stringLiteral(`var(${token})`); changed++; }
    }
  });

  // CSS-in-JS template literals: colours are unambiguous text; rewrite in place
  root.find(j.TemplateElement).forEach((path) => {
    let raw = path.node.value.raw;
    let touched = false;
    for (const [literal, token] of colorByLiteral) {
      if (raw.toLowerCase().includes(literal)) {
        raw = raw.replace(new RegExp(literal.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), `var(${token})`);
        touched = true;
      }
    }
    if (touched) {
      path.node.value = { raw, cooked: raw };
      changed++;
    }
  });

  // null = untouched: jscodeshift leaves the file byte-identical instead of
  // reprinting it, keeping the diff to exactly the intended change.
  return changed ? root.toSource({ quote: 'single' }) : null;
};

module.exports.parser = 'tsx';
