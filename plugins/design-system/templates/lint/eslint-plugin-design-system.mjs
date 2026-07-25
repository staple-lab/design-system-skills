/**
 * eslint-plugin-design-system — the enforcement layer.
 *
 * Rules read the GENERATED tokens/dist/tokens.json, so they can never disagree with the
 * tokens themselves. That is the whole payoff of one source: docs, lint and tests all
 * read the same file.
 *
 * Design principle: a rule with false positives gets disabled, and a disabled rule
 * enforces nothing. These are deliberately narrow, and every message names the
 * replacement — "use a design token" tells the developer nothing; "try color.bg.accent"
 * gets fixed in five seconds.
 *
 * Setup:
 *   import ds from './tools/eslint-plugin-design-system.mjs';
 *   export default [{
 *     plugins: { ds },
 *     rules: { 'ds/no-raw-color': 'error', 'ds/no-hardcoded-dimension': 'error',
 *              'ds/no-primitive-token': 'error', 'ds/no-deep-import': 'error' },
 *     settings: { designSystem: { tokens: './tokens/dist/tokens.json', packageName: '@acme/ui' } },
 *   }];
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// ---------------------------------------------------------------------------
// shared helpers (exported for unit tests)
// ---------------------------------------------------------------------------

export const COLOR_RE =
  /(#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})\b|\b(?:rgba?|hsla?|oklch|oklab|lab|lch)\([^)]*\))/g;

export const PX_RE = /(-?\d*\.?\d+)px\b/g;

/** Properties where a bare number means a dimension and therefore should be a token. */
export const DIMENSION_PROPS = new Set([
  'padding', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
  'paddingInline', 'paddingBlock', 'paddingInlineStart', 'paddingInlineEnd',
  'margin', 'marginTop', 'marginRight', 'marginBottom', 'marginLeft',
  'marginInline', 'marginBlock',
  'gap', 'rowGap', 'columnGap',
  'top', 'right', 'bottom', 'left', 'inset',
  'borderRadius', 'width', 'height', 'minWidth', 'minHeight', 'maxWidth', 'maxHeight',
  'fontSize', 'lineHeight', 'letterSpacing',
]);

export function normaliseHex(input) {
  const s = String(input).trim().toLowerCase();
  const m = /^#([0-9a-f]{3,8})$/.exec(s);
  if (!m) return s;
  let h = m[1];
  if (h.length === 3 || h.length === 4) h = [...h].map((c) => c + c).join('');
  return `#${h.slice(0, 6)}`;
}

/**
 * Build the lookup the rules consult. Semantic tokens win over primitives when both
 * resolve to the same value — suggesting `color.accent.600` for a raw hex would trade
 * one un-themeable value for another.
 */
export function createTokenIndex(json) {
  const byHex = new Map();
  const byHexTier = new Map();
  const byDimension = new Map();
  const primitiveVars = new Set();
  const semanticVars = new Set();
  const allPaths = new Set();

  const themes = json?.themes ?? {};
  for (const theme of Object.values(themes)) {
    for (const [path, token] of Object.entries(theme)) {
      allPaths.add(path);
      const cssVar = String(token.var ?? '').replace(/^var\(|\)$/g, '');
      if (token.tier === 'primitive') primitiveVars.add(cssVar);
      else semanticVars.add(cssVar);

      if (token.hex) {
        // A semantic token must OVERRIDE a primitive that resolves to the same value.
        // Primitives are read first (primitive.tokens.json loads first), so a plain
        // first-wins index would suggest `color.accent.600` for a raw hex — trading one
        // un-themeable value for another, which is the exact failure this rule exists to stop.
        const isSemantic = token.tier !== 'primitive';
        if (!byHex.has(token.hex) || (isSemantic && byHexTier.get(token.hex) === 'primitive')) {
          byHex.set(token.hex, path);
          byHexTier.set(token.hex, isSemantic ? 'semantic' : 'primitive');
        }
      }

      if (token.type === 'dimension' && /^-?\d+(\.\d+)?px$/.test(String(token.value))) {
        const n = parseFloat(token.value);
        if (!byDimension.has(n) || path.startsWith('space.')) byDimension.set(n, path);
      }
    }
  }

  return { byHex, byDimension, primitiveVars, semanticVars, allPaths };
}

export function nearestDimension(index, value) {
  let best = null;
  let bestDelta = Infinity;
  for (const [n, path] of index.byDimension) {
    const delta = Math.abs(n - value);
    if (delta < bestDelta) {
      bestDelta = delta;
      best = { path, value: n, delta };
    }
  }
  return best;
}

export function cssVarFor(path, prefix = 'ds') {
  return `--${prefix}-${path.replace(/\./g, '-')}`;
}

const cache = new Map();

function loadIndex(context) {
  const settings = context.settings?.designSystem ?? {};
  const file = settings.tokens ?? './tokens/dist/tokens.json';
  const key = resolve(context.cwd ?? process.cwd(), file);
  if (!cache.has(key)) {
    try {
      cache.set(key, createTokenIndex(JSON.parse(readFileSync(key, 'utf8'))));
    } catch {
      // No token file yet (fresh scaffold, or lint running before the token build).
      // Degrade to detection-without-suggestions rather than crashing the whole lint run.
      cache.set(key, createTokenIndex({ themes: {} }));
    }
  }
  return cache.get(key);
}

const prefixOf = (context) => context.settings?.designSystem?.prefix ?? 'ds';

/** Every place a string can hide in JSX/TS, without walking into imports. */
function stringNodes(context, visit) {
  return {
    Literal(node) {
      if (typeof node.value !== 'string') return;
      if (node.parent?.type === 'ImportDeclaration' || node.parent?.type === 'ImportExpression') return;
      if (node.parent?.type === 'Property' && node.parent.key === node) return;
      visit(node, node.value);
    },
    TemplateElement(node) {
      if (!node.value?.cooked) return;
      visit(node, node.value.cooked);
    },
    JSXAttribute(node) {
      if (node.value?.type === 'Literal' && typeof node.value.value === 'string') {
        visit(node.value, node.value.value);
      }
    },
  };
}

// ---------------------------------------------------------------------------
// rules
// ---------------------------------------------------------------------------

const noRawColor = {
  meta: {
    type: 'problem',
    docs: { description: 'Use semantic design tokens instead of raw colour values' },
    fixable: 'code',
    schema: [{ type: 'object', properties: { allow: { type: 'array', items: { type: 'string' } } }, additionalProperties: false }],
    messages: {
      raw: 'Raw colour "{{value}}". Raw colours do not re-theme{{suggestion}}.',
    },
  },
  create(context) {
    const index = loadIndex(context);
    const prefix = prefixOf(context);
    const allow = new Set([
      'transparent', 'currentColor', 'inherit', 'none',
      ...(context.options?.[0]?.allow ?? []),
    ]);

    const check = (node, text) => {
      for (const match of text.matchAll(COLOR_RE)) {
        const raw = match[0];
        if (allow.has(raw)) continue;
        const hex = normaliseHex(raw);
        const token = index.byHex.get(hex);
        context.report({
          node,
          messageId: 'raw',
          data: { value: raw, suggestion: token ? ` — use ${token}: var(${cssVarFor(token, prefix)})` : '. Add a token for it first' },
          // Only autofix when the whole literal IS the colour and a token matches exactly.
          fix:
            token && node.type === 'Literal' && text.trim() === raw
              ? (fixer) => fixer.replaceText(node, `'var(${cssVarFor(token, prefix)})'`)
              : undefined,
        });
      }
    };

    return stringNodes(context, check);
  },
};

const noHardcodedDimension = {
  meta: {
    type: 'problem',
    docs: { description: 'Use the spacing/radius scale instead of hardcoded pixel values' },
    schema: [
      {
        type: 'object',
        properties: { allow: { type: 'array', items: { type: 'number' } } },
        additionalProperties: false,
      },
    ],
    messages: {
      px: 'Hardcoded {{value}}px is not on the scale{{suggestion}}.',
      bare: 'Hardcoded {{value}} for `{{prop}}`{{suggestion}}.',
    },
  },
  create(context) {
    const index = loadIndex(context);
    const prefix = prefixOf(context);
    // 0 is not a decision, and 1px hairlines are legitimate — flagging them is noise
    // that gets the whole rule disabled.
    const allow = new Set(context.options?.[0]?.allow ?? [0, 1]);

    const suggest = (n) => {
      const near = nearestDimension(index, n);
      if (!near) return '';
      return near.delta === 0
        ? ` — use ${near.path}: var(${cssVarFor(near.path, prefix)})`
        : ` — nearest is ${near.path} (${near.value}px)`;
    };

    const checkString = (node, text) => {
      // calc() is usually relative arithmetic where a literal is the point.
      if (text.includes('calc(')) return;
      for (const match of text.matchAll(PX_RE)) {
        const n = parseFloat(match[1]);
        if (allow.has(n)) continue;
        const near = nearestDimension(index, n);
        if (near && near.delta === 0) continue; // on the scale, just written literally
        context.report({ node, messageId: 'px', data: { value: match[1], suggestion: suggest(n) } });
      }
    };

    return {
      ...stringNodes(context, checkString),
      Property(node) {
        if (node.value?.type !== 'Literal' || typeof node.value.value !== 'number') return;
        const name = node.key?.name ?? node.key?.value;
        if (!DIMENSION_PROPS.has(name)) return;
        const n = node.value.value;
        if (allow.has(n)) return;
        const near = nearestDimension(index, n);
        if (near && near.delta === 0) return;
        context.report({
          node: node.value,
          messageId: 'bare',
          data: { value: String(n), prop: name, suggestion: suggest(n) },
        });
      },
    };
  },
};

const noPrimitiveToken = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Components must consume semantic tokens, never primitives — a primitive reference cannot be re-themed',
    },
    schema: [],
    messages: {
      primitive:
        'Primitive token "{{value}}" in a component. Primitives do not re-theme: pick a semantic token that means what you want (color.bg.*, color.fg.*, color.border.*), or add one.',
    },
  },
  create(context) {
    const index = loadIndex(context);
    const prefix = prefixOf(context);
    const varRe = new RegExp(`--${prefix}-[a-z0-9-]+`, 'g');

    const check = (node, text) => {
      for (const match of text.matchAll(varRe)) {
        if (index.primitiveVars.has(match[0])) {
          context.report({ node, messageId: 'primitive', data: { value: match[0] } });
        }
      }
    };

    return stringNodes(context, check);
  },
};

const noDeepImport = {
  meta: {
    type: 'problem',
    docs: { description: 'Import from the design system’s public entry points only' },
    schema: [
      {
        type: 'object',
        properties: {
          packageName: { type: 'string' },
          primitives: { type: 'array', items: { type: 'string' } },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      deep: 'Deep import "{{source}}". Import from {{pkg}} or {{pkg}}/<component> — internal paths break on any refactor.',
      primitive:
        'Product code imports the primitive layer directly ("{{source}}"). Use {{pkg}}. If the component you need is missing, that request IS the roadmap — ask for it.',
    },
  },
  create(context) {
    const opts = context.options?.[0] ?? {};
    const settings = context.settings?.designSystem ?? {};
    const pkg = opts.packageName ?? settings.packageName ?? '@acme/ui';
    const primitives = opts.primitives ?? ['@radix-ui/', '@base-ui/', '@base-ui-components/', 'react-aria-components', '@ark-ui/'];

    const check = (node) => {
      const source = node.source?.value;
      if (typeof source !== 'string') return;

      if (source.startsWith(`${pkg}/`)) {
        const sub = source.slice(pkg.length + 1);
        if (/^(dist|src|lib|es|cjs)\b/.test(sub)) {
          context.report({ node: node.source, messageId: 'deep', data: { source, pkg } });
        }
        return;
      }

      if (primitives.some((p) => source.startsWith(p))) {
        context.report({ node: node.source, messageId: 'primitive', data: { source, pkg } });
      }
    };

    return { ImportDeclaration: check, ExportNamedDeclaration: check, ExportAllDeclaration: check };
  },
};

export const rules = {
  'no-raw-color': noRawColor,
  'no-hardcoded-dimension': noHardcodedDimension,
  'no-primitive-token': noPrimitiveToken,
  'no-deep-import': noDeepImport,
};

export default {
  meta: { name: 'eslint-plugin-design-system', version: '0.1.0' },
  rules,
  configs: {
    /** Start here. Warnings make the honest baseline visible without blocking anyone. */
    recommended: {
      rules: {
        'ds/no-raw-color': 'warn',
        'ds/no-hardcoded-dimension': 'warn',
        'ds/no-primitive-token': 'error',
        'ds/no-deep-import': 'error',
      },
    },
    /** Ratchet to this per-directory as each area gets migrated. */
    strict: {
      rules: {
        'ds/no-raw-color': 'error',
        'ds/no-hardcoded-dimension': 'error',
        'ds/no-primitive-token': 'error',
        'ds/no-deep-import': 'error',
      },
    },
  },
};
