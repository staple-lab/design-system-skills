#!/usr/bin/env node
/**
 * Design token build — DTCG JSON in, everything else out.
 *
 * Zero dependencies on purpose: this runs in CI, in a pre-commit hook, and on a
 * designer's machine that has never run `npm install`. Swap it for Style Dictionary v5
 * if you need its plugin ecosystem or a Figma round-trip via Tokens Studio.
 *
 *   tokens/
 *     primitive.tokens.json            theme-independent raw values
 *     semantic.<theme>.tokens.json     one file per theme, same paths in each
 *     component.tokens.json            per-component knobs (resolved per theme)
 *     density.<name>.tokens.json       optional — theme-independent re-values of existing
 *                                      tokens, emitted as a [data-density='<name>'] block
 *     brand.<name>.tokens.json         optional — a brand's primitive palette, applied to
 *                                      every theme; emitted as [data-brand='<name>'] blocks
 *     brand.<name>.<theme>.tokens.json optional — brand semantic re-points for ONE theme
 *                                      (needed when the brand hue's contrast behaviour
 *                                      differs from the default's — see scales.md)
 *
 * The default density and the default brand are the plain document: no file, no attribute.
 * Brand spaces run through the same contrast gate as the base themes — a brand that fails
 * AA fails the build.
 *
 * Outputs land in tokens/dist/. Commit them: the diff is the visual review, and
 * package consumers should not need to run this build.
 *
 * Usage: node tokens/build.mjs [--check]      (--check = fail if output is stale)
 */

import { readFileSync, writeFileSync, readdirSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = HERE;
const OUT = join(HERE, 'dist');
const ROOT = join(HERE, '..');

// ---------------------------------------------------------------------------
// config
// ---------------------------------------------------------------------------

const config = readConfig();

function readConfig() {
  const defaults = {
    prefix: 'ds',
    defaultTheme: 'light',
    darkTheme: 'dark',
    cssSystem: 'css-modules',
    contrast: { level: 'AA', enforce: true },
  };
  for (const candidate of ['design-system.config.json', '../design-system.config.json']) {
    const p = join(ROOT, candidate);
    if (existsSync(p)) {
      const raw = JSON.parse(readFileSync(p, 'utf8'));
      return { ...defaults, ...(raw.tokens ?? {}), cssSystem: raw.stack?.cssSystem ?? defaults.cssSystem };
    }
  }
  return defaults;
}

const P = config.prefix ? `--${config.prefix}-` : '--';

// ---------------------------------------------------------------------------
// load + flatten DTCG
// ---------------------------------------------------------------------------

/** A token file is DTCG: nested groups, `$value`/`$type`/`$description`, `$type` inherits. */
function flatten(node, path = [], inheritedType = undefined, out = new Map()) {
  const type = node.$type ?? inheritedType;
  for (const [key, child] of Object.entries(node)) {
    if (key.startsWith('$')) continue;
    if (child && typeof child === 'object' && '$value' in child) {
      out.set([...path, key].join('.'), {
        path: [...path, key].join('.'),
        value: child.$value,
        type: child.$type ?? type,
        description: child.$description ?? '',
        extensions: child.$extensions?.['design-system'] ?? {},
      });
    } else if (child && typeof child === 'object') {
      flatten(child, [...path, key], child.$type ?? type, out);
    }
  }
  return out;
}

function loadTokenFiles() {
  const files = readdirSync(SRC).filter((f) => f.endsWith('.tokens.json'));
  if (!files.length) die(`No *.tokens.json files found in ${SRC}`);

  const base = new Map();
  const themes = new Map(); // theme -> Map
  const componentFiles = [];
  const densities = new Map(); // density name -> Map of overrides
  const brands = new Map(); // brand name -> { shared: Map|null, themes: Map<theme, Map> }

  for (const file of files) {
    const json = JSON.parse(readFileSync(join(SRC, file), 'utf8'));
    const name = basename(file, '.tokens.json');
    const themeMatch = /^semantic\.(.+)$/.exec(name);
    const densityMatch = /^density\.(.+)$/.exec(name);
    const brandMatch = /^brand\.(.+)$/.exec(name);
    if (themeMatch) {
      themes.set(themeMatch[1], flatten(json));
    } else if (densityMatch) {
      if (densityMatch[1].includes('.')) die(`Density files are density.<name>.tokens.json (one segment) — got ${file}`);
      densities.set(densityMatch[1], flatten(json));
    } else if (brandMatch) {
      const parts = brandMatch[1].split('.');
      if (parts.length > 2) die(`Brand files are brand.<name>.tokens.json or brand.<name>.<theme>.tokens.json — got ${file}`);
      const [bname, btheme] = parts;
      const entry = brands.get(bname) ?? { shared: null, themes: new Map() };
      if (btheme) entry.themes.set(btheme, flatten(json));
      else entry.shared = flatten(json);
      brands.set(bname, entry);
    } else if (name.startsWith('component')) {
      componentFiles.push(flatten(json));
    } else {
      for (const [k, v] of flatten(json)) base.set(k, v);
    }
  }

  if (!themes.size) die('No semantic.<theme>.tokens.json files found — a system needs at least one theme.');
  return { base, themes, component: componentFiles, densities, brands };
}

// ---------------------------------------------------------------------------
// reference resolution
// ---------------------------------------------------------------------------

const REF = /^\{([^}]+)\}$/;
const REF_INLINE = /\{([^}]+)\}/g;

function resolveAll(space) {
  const resolved = new Map();
  const resolving = new Set();

  const resolveToken = (key) => {
    if (resolved.has(key)) return resolved.get(key);
    const token = space.get(key);
    if (!token) die(`Unknown token reference: {${key}}`);
    if (resolving.has(key)) die(`Circular token reference at {${key}} — chain: ${[...resolving].join(' → ')}`);
    resolving.add(key);
    const value = resolveValue(token.value, resolveToken);
    resolving.delete(key);
    // Keep the pre-resolution reference: when the contrast gate fails, "{color.accent.600}"
    // is the actionable name, not the hex it resolved to.
    const whole = typeof token.value === 'string' ? REF.exec(token.value.trim()) : null;
    const out = { ...token, value, type: token.type ?? space.get(key)?.type, ref: whole ? whole[1].trim() : undefined };
    resolved.set(key, out);
    return out;
  };

  for (const key of space.keys()) resolveToken(key);
  return resolved;
}

function resolveValue(value, resolveToken) {
  if (typeof value === 'string') {
    const whole = REF.exec(value.trim());
    if (whole) return resolveToken(whole[1].trim()).value;
    if (REF_INLINE.test(value)) {
      return value.replace(REF_INLINE, (_, ref) => stringify(resolveToken(ref.trim())));
    }
    return value;
  }
  if (Array.isArray(value)) return value.map((v) => resolveValue(v, resolveToken));
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, resolveValue(v, resolveToken)]));
  }
  return value;
}

// ---------------------------------------------------------------------------
// value → CSS
// ---------------------------------------------------------------------------

function stringify(token) {
  return toCss(token.value, token.type);
}

function toCss(value, type) {
  switch (type) {
    case 'dimension':
    case 'duration':
      return dim(value);
    case 'cubicBezier':
      return Array.isArray(value) ? `cubic-bezier(${value.join(', ')})` : String(value);
    case 'fontFamily':
      return Array.isArray(value) ? value.map(quoteFamily).join(', ') : String(value);
    case 'shadow':
      return (Array.isArray(value) ? value : [value]).map(shadow).join(', ');
    case 'border':
      return `${dim(value.width)} ${value.style} ${value.color}`;
    case 'transition':
      return `${dim(value.duration)} ${toCss(value.timingFunction, 'cubicBezier')} ${dim(value.delay ?? 0)}`;
    case 'number':
    case 'fontWeight':
      return String(value);
    default:
      if (value && typeof value === 'object' && 'value' in value && 'unit' in value) return dim(value);
      return String(value);
  }
}

function dim(v) {
  if (v == null) return '0';
  if (typeof v === 'number') return v === 0 ? '0' : `${v}px`;
  if (typeof v === 'string') return v;
  const unit = v.unit === 'rem' ? 'rem' : v.unit ?? 'px';
  return v.value === 0 && unit === 'px' ? '0' : `${v.value}${unit}`;
}

function quoteFamily(f) {
  return /^[a-zA-Z-]+$/.test(f) || f.startsWith('var(') ? f : `"${f}"`;
}

function shadow(s) {
  if (typeof s === 'string') return s;
  const inset = s.inset ? 'inset ' : '';
  const spread = s.spread != null ? ` ${dim(s.spread)}` : '';
  return `${inset}${dim(s.offsetX)} ${dim(s.offsetY)} ${dim(s.blur)}${spread} ${s.color}`;
}

/** `color.bg.accent` → `--<prefix>-color-bg-accent` — prefix from config `tokens.prefix`, default `ds` */
function varName(path) {
  return P + path.replace(/\./g, '-').replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();
}

/**
 * Composite tokens (typography) expand into one custom property per sub-value —
 * CSS has no way to hold a composite, and consumers want the parts anyway.
 */
function expand(token) {
  if (token.type === 'typography' && token.value && typeof token.value === 'object') {
    const v = token.value;
    const parts = [];
    if (v.fontSize != null) parts.push([`${token.path}.font-size`, dim(v.fontSize)]);
    if (v.lineHeight != null) parts.push([`${token.path}.line-height`, String(v.lineHeight)]);
    if (v.fontWeight != null) parts.push([`${token.path}.font-weight`, String(v.fontWeight)]);
    if (v.letterSpacing != null) parts.push([`${token.path}.letter-spacing`, dim(v.letterSpacing)]);
    if (v.fontFamily != null) parts.push([`${token.path}.font-family`, toCss(v.fontFamily, 'fontFamily')]);
    return parts;
  }
  return [[token.path, stringify(token)]];
}

// ---------------------------------------------------------------------------
// colour maths — needed for the contrast gate, and for hex fallbacks
// ---------------------------------------------------------------------------

/** Parse hex / rgb() / oklch() into linear-light sRGB channels (0..1). Returns null if unparseable. */
function parseColor(input) {
  if (typeof input !== 'string') return null;
  const s = input.trim().toLowerCase();

  let m = /^#([0-9a-f]{3,8})$/.exec(s);
  if (m) {
    let h = m[1];
    if (h.length === 3 || h.length === 4) h = [...h].map((c) => c + c).join('');
    const n = parseInt(h.slice(0, 6), 16);
    return { r: ((n >> 16) & 255) / 255, g: ((n >> 8) & 255) / 255, b: (n & 255) / 255 };
  }

  m = /^rgba?\(([^)]+)\)$/.exec(s);
  if (m) {
    const [r, g, b] = m[1].split(/[\s,/]+/).filter(Boolean).slice(0, 3).map((v) =>
      v.endsWith('%') ? parseFloat(v) / 100 : parseFloat(v) / 255,
    );
    return { r, g, b };
  }

  m = /^oklch\(([^)]+)\)$/.exec(s);
  if (m) {
    const parts = m[1].split('/')[0].trim().split(/\s+/);
    const L = parts[0].endsWith('%') ? parseFloat(parts[0]) / 100 : parseFloat(parts[0]);
    const C = parseFloat(parts[1]);
    const H = parseFloat(parts[2] ?? '0');
    return oklchToSrgb(L, C, H);
  }

  return null; // named colours, colour-mix(), currentColor, transparent…
}

function oklchToSrgb(L, C, Hdeg) {
  const h = (Hdeg * Math.PI) / 180;
  const a = C * Math.cos(h);
  const b = C * Math.sin(h);

  // OKLab → LMS
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.291485548 * b;
  const l = l_ ** 3, m = m_ ** 3, s = s_ ** 3;

  // LMS → linear sRGB
  const lr = +4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s;
  const lg = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
  const lb = -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s;

  return { r: gamma(lr), g: gamma(lg), b: gamma(lb) };
}

const gamma = (c) => {
  const v = c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(Math.max(c, 0), 1 / 2.4) - 0.055;
  return Math.min(1, Math.max(0, v));
};
const linear = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);

function toHex({ r, g, b }) {
  const h = (v) => Math.round(Math.min(1, Math.max(0, v)) * 255).toString(16).padStart(2, '0');
  return `#${h(r)}${h(g)}${h(b)}`;
}

function luminance({ r, g, b }) {
  return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
}

function contrast(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

// ---------------------------------------------------------------------------
// contrast gate
// ---------------------------------------------------------------------------

/**
 * Pairs are discovered by naming convention, which is exactly why the convention
 * is worth enforcing:
 *   color.fg.on-<x>  must clear against  color.bg.<x>
 *   color.fg.<y>     must clear against  color.bg.default (and bg.surface if present)
 * Override per token with $extensions["design-system"].contrast: { min, against, skip }.
 */
function checkContrast(themeName, resolved) {
  const level = config.contrast?.level ?? 'AA';
  const defaultMin = level === 'AAA' ? 7 : 4.5;
  const failures = [];
  const checked = [];

  for (const [path, token] of resolved) {
    if (!path.startsWith('color.fg.')) continue;
    const ext = token.extensions?.contrast ?? {};
    if (ext.skip) continue;

    const role = path.slice('color.fg.'.length);
    let against = [];
    if (ext.against) against = (Array.isArray(ext.against) ? ext.against : [ext.against]);
    else if (role.startsWith('on-')) against = [`color.bg.${role.slice(3)}`];
    else against = ['color.bg.default', 'color.bg.surface'].filter((p) => resolved.has(p));

    const min = ext.min ?? defaultMin;
    const fg = parseColor(token.value);
    if (!fg) continue;

    for (const bgPath of against) {
      const bgToken = resolved.get(bgPath);
      if (!bgToken) continue;
      const bg = parseColor(bgToken.value);
      if (!bg) continue;
      const ratio = contrast(fg, bg);
      checked.push({ theme: themeName, fg: path, bg: bgPath, ratio: +ratio.toFixed(2), min, pass: ratio >= min });
      if (ratio < min) {
        // Name the step behind each side: with an imported palette (import-palette.mjs)
        // the fix is swapping which step the semantic token points at, and the step's
        // $description says which vendor value is sitting there.
        const refLine = (p, t) => {
          if (!t?.ref) return '';
          const prim = resolved.get(t.ref);
          return `\n      ${p} = {${t.ref}}${prim?.description ? ` — ${prim.description}` : ''}`;
        };
        failures.push(
          `  ${themeName}: ${path} on ${bgPath} → ${ratio.toFixed(2)}:1 (needs ${min}:1)\n` +
            `      ${toHex(fg)} on ${toHex(bg)}` +
            refLine(bgPath, bgToken) +
            refLine(path, token) +
            (bgToken?.ref || token.ref
              ? `\n      Swap the referenced step until the pair clears ${min}:1 (e.g. point the bg one step darker, or the fg one step further from it).`
              : ''),
        );
      }
    }
  }
  return { failures, checked };
}

// ---------------------------------------------------------------------------
// emitters
// ---------------------------------------------------------------------------

/** Vars in `next` that are new or changed relative to `prev`. Overlays only add, never remove. */
function diffVars(prev, next) {
  const d = new Map();
  for (const [name, value] of next) {
    if (prev.get(name) !== value) d.set(name, value);
  }
  return d;
}

function emitCss(themeVars, themeNames, densityVars = new Map(), brandVars = new Map()) {
  const [first] = themeNames;
  // Anything identical across every theme belongs in :root once, not repeated per theme.
  const shared = new Map();
  const perTheme = new Map(themeNames.map((t) => [t, new Map()]));

  for (const [name] of themeVars.get(first)) {
    const values = themeNames.map((t) => themeVars.get(t).get(name));
    if (values.every((v) => v === values[0])) shared.set(name, values[0]);
    else themeNames.forEach((t, i) => perTheme.get(t).set(name, values[i]));
  }
  // A token that only exists in some themes still has to be emitted.
  for (const t of themeNames) {
    for (const [name, value] of themeVars.get(t)) {
      if (!shared.has(name) && !perTheme.get(t).has(name)) perTheme.get(t).set(name, value);
    }
  }

  const dflt = config.defaultTheme && themeNames.includes(config.defaultTheme) ? config.defaultTheme : first;
  const dark = themeNames.includes(config.darkTheme) ? config.darkTheme : null;

  const block = (selector, map, comment) =>
    map.size
      ? `${comment ? `/* ${comment} */\n` : ''}${selector} {\n${[...map]
          .map(([n, v]) => `  ${n}: ${v};`)
          .join('\n')}\n}\n`
      : '';

  let css = `/* GENERATED by tokens/build.mjs — do not edit. Edit tokens/*.tokens.json. */\n\n`;
  css += block(':root', shared, 'theme-independent');
  css += '\n';
  css += block(`:root, [data-theme='${dflt}']`, perTheme.get(dflt), `theme: ${dflt} (default)`);
  for (const t of themeNames.filter((t) => t !== dflt)) {
    css += '\n' + block(`[data-theme='${t}']`, perTheme.get(t), `theme: ${t}`);
  }
  if (dark && dark !== dflt) {
    // Honour the OS preference until the user explicitly chooses; [data-theme] always wins.
    css +=
      `\n/* OS preference, only while no explicit choice has been made */\n` +
      `@media (prefers-color-scheme: dark) {\n` +
      `  :root:not([data-theme]) {\n${[...perTheme.get(dark)]
        .map(([n, v]) => `    ${n}: ${v};`)
        .join('\n')}\n  }\n}\n`;
  }

  // Brand blocks. [data-brand] alone carries the default theme's brand values; because it
  // sits later in the file than [data-theme='<t>'] at equal specificity, every themed brand
  // block must re-state the union of touched vars or the default-theme brand values would
  // bleed into other themes.
  for (const [bname, perBrandTheme] of brandVars) {
    const dfltDiff = diffVars(themeVars.get(dflt), perBrandTheme.get(dflt));
    css += '\n' + block(`[data-brand='${bname}']`, dfltDiff, `brand: ${bname} — theme: ${dflt} (default)`);
    for (const t of themeNames.filter((t) => t !== dflt)) {
      const tDiff = diffVars(themeVars.get(t), perBrandTheme.get(t));
      const names = new Set([...dfltDiff.keys(), ...tDiff.keys()]);
      const merged = new Map(
        [...names].map((n) => [n, perBrandTheme.get(t).get(n) ?? themeVars.get(t).get(n)]),
      );
      css += '\n' + block(`[data-brand='${bname}'][data-theme='${t}']`, merged, `brand: ${bname} — theme: ${t}`);
      if (t === dark && merged.size) {
        css +=
          `\n/* brand: ${bname} — OS dark preference, only while no explicit choice has been made */\n` +
          `@media (prefers-color-scheme: dark) {\n` +
          `  [data-brand='${bname}']:not([data-theme]) {\n${[...merged]
            .map(([n, v]) => `    ${n}: ${v};`)
            .join('\n')}\n  }\n}\n`;
      }
    }
  }

  // Density blocks last: density re-values dimensions that live in the shared :root block,
  // and equal specificity + later position is what makes [data-density] win.
  for (const [dname, diff] of densityVars) {
    css += '\n' + block(`[data-density='${dname}']`, diff, `density: ${dname}`);
  }

  return css;
}

function emitTs(flatByTheme, themeNames) {
  const entries = [...flatByTheme.get(themeNames[0]).keys()]
    .map((p) => `  ${JSON.stringify(p)}: 'var(${varName(p)})',`)
    .join('\n');

  const raw = Object.fromEntries(themeNames.map((t) => [t, Object.fromEntries(flatByTheme.get(t))]));

  return `/* GENERATED by tokens/build.mjs — do not edit. */

/** Every token as a \`var()\` reference. Use these, not raw values — raw values don't re-theme. */
export const token = {
${entries}
} as const;

export type TokenName = keyof typeof token;

/** Resolved values per theme. For docs, tests and tooling — not for styling. */
export const resolved = ${JSON.stringify(raw, null, 2)} as const;

export const themes = ${JSON.stringify(themeNames)} as const;
export type ThemeName = (typeof themes)[number];
`;
}

/** The flat map is what the inventory site and AI agents read, so composite parts get their own entries. */
function emitJson(resolvedByTheme, flatByTheme, themeNames, contrastReport, modes = {}) {
  const themes = {};
  for (const t of themeNames) {
    const resolved = resolvedByTheme.get(t);
    const out = {};
    for (const [path, value] of flatByTheme.get(t)) {
      const own = resolved.get(path);
      const parentPath = path.split('.').slice(0, -1).join('.');
      const parent = own ? null : resolved.get(parentPath);
      const type = own ? own.type ?? 'other' : subType(path);
      const color = type === 'color' ? parseColor(value) : null;
      out[path] = {
        value,
        type,
        tier: tier(path, own ?? parent ?? {}),
        description: own?.description || undefined,
        var: `var(${varName(path)})`,
        hex: color ? toHex(color) : undefined,
        partOf: parent ? parentPath : undefined,
      };
    }
    themes[t] = out;
  }
  return JSON.stringify(
    {
      generated: 'tokens/build.mjs',
      themes,
      densities: modes.densities ?? [],
      brands: modes.brands ?? [],
      contrast: contrastReport,
    },
    null,
    2,
  );
}

function subType(path) {
  if (path.endsWith('.font-size') || path.endsWith('.letter-spacing')) return 'dimension';
  if (path.endsWith('.line-height')) return 'number';
  if (path.endsWith('.font-weight')) return 'fontWeight';
  if (path.endsWith('.font-family')) return 'fontFamily';
  return 'other';
}

function tier(path, token) {
  if (token.extensions?.tier) return token.extensions.tier;
  const [head] = path.split('.');
  if (path.startsWith('color.') && /^color\.(bg|fg|border|ring|shadow)\./.test(path)) return 'semantic';
  if (['space', 'radius', 'border-width', 'opacity', 'shadow', 'duration', 'easing', 'z', 'type', 'font'].includes(head)) return 'semantic';
  if (path.split('.').length > 1 && !['color', 'space', 'radius', 'border-width', 'opacity', 'shadow', 'duration', 'easing', 'z', 'type', 'font'].includes(head))
    return 'component';
  return 'primitive';
}

/** Tailwind v4: `@theme inline` maps Tailwind's namespaces onto our vars, so utilities re-theme for free. */
function emitTailwind(flatByTheme, themeNames) {
  const seen = new Map();
  for (const t of themeNames) {
    for (const [path] of flatByTheme.get(t)) {
      const name = tailwindName(path);
      if (name && !seen.has(name)) seen.set(name, varName(path));
    }
  }
  return (
    `/* GENERATED by tokens/build.mjs — do not edit. */\n` +
    `@import 'tailwindcss';\n@import './tokens.css';\n\n` +
    `/* \`inline\` keeps the utilities pointing at the live custom properties, so\n` +
    `   switching [data-theme] restyles without a rebuild. */\n@theme inline {\n` +
    [...seen].map(([name, ref]) => `  ${name}: var(${ref});`).join('\n') +
    `\n}\n`
  );
}

function tailwindName(path) {
  const seg = (s) => s.replace(/\./g, '-');
  if (path === 'color.bg.default') return '--color-background';
  if (path === 'color.fg.default') return '--color-foreground';
  if (path === 'color.border.default') return '--color-border';
  if (path.startsWith('color.bg.')) return `--color-${seg(path.slice(9))}`;
  if (path.startsWith('color.fg.on-')) return `--color-${seg(path.slice(12))}-foreground`;
  if (path.startsWith('color.fg.')) return `--color-fg-${seg(path.slice(9))}`;
  if (path.startsWith('color.border.')) return `--color-border-${seg(path.slice(13))}`;
  if (path === 'color.ring') return '--color-ring';
  if (path.startsWith('color.ring.')) return `--color-ring-${seg(path.slice(11))}`;
  if (path.startsWith('space.')) return `--spacing-${seg(path.slice(6))}`;
  if (path.startsWith('radius.')) return `--radius-${seg(path.slice(7))}`;
  if (path.startsWith('shadow.')) return `--shadow-${seg(path.slice(7))}`;
  if (path.startsWith('easing.')) return `--ease-${seg(path.slice(7))}`;
  if (path.startsWith('font.family.')) return `--font-${seg(path.slice(12))}`;
  if (path.startsWith('type.') && path.endsWith('.font-size')) return `--text-${seg(path.slice(5, -10))}`;
  if (path.startsWith('type.') && path.endsWith('.line-height')) return `--text-${seg(path.slice(5, -12))}--line-height`;
  if (path.startsWith('type.') && path.endsWith('.font-weight')) return `--text-${seg(path.slice(5, -12))}--font-weight`;
  if (path.startsWith('type.') && path.endsWith('.letter-spacing')) return `--text-${seg(path.slice(5, -15))}--letter-spacing`;
  return null; // primitive ramps stay out of the utility namespace — utilities are for the semantic tier
}

/** vanilla-extract: a contract makes it a *type error* for a theme to miss a token. */
function emitVanillaExtract(flatByTheme, themeNames) {
  const tree = {};
  for (const [path] of flatByTheme.get(themeNames[0])) {
    let node = tree;
    const parts = path.split('.');
    parts.forEach((p, i) => {
      const key = p.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
      if (i === parts.length - 1) node[key] = varName(path);
      else node = node[key] ??= {};
    });
  }
  return (
    `/* GENERATED by tokens/build.mjs — do not edit. */\n` +
    `import { createGlobalThemeContract } from '@vanilla-extract/css';\n\n` +
    `/* Maps onto the custom properties already emitted in tokens.css, so themes stay\n` +
    `   runtime-switchable while styles stay type-checked. */\n` +
    `export const vars = createGlobalThemeContract(${JSON.stringify(tree, null, 2)});\n`
  );
}

/** StyleX: typed vars, atomic output. */
function emitStylex(flatByTheme, themeNames) {
  const dflt = themeNames.includes(config.defaultTheme) ? config.defaultTheme : themeNames[0];
  const dark = themeNames.find((t) => t === config.darkTheme);
  const entries = [...flatByTheme.get(dflt)].map(([path, light]) => {
    const key = path.replace(/[.-]([a-z0-9])/g, (_, c) => c.toUpperCase());
    if (dark) {
      const dv = flatByTheme.get(dark).get(path) ?? light;
      if (dv !== light) {
        return `  ${key}: { default: ${JSON.stringify(light)}, '@media (prefers-color-scheme: dark)': ${JSON.stringify(dv)} },`;
      }
    }
    return `  ${key}: ${JSON.stringify(light)},`;
  });
  return (
    `/* GENERATED by tokens/build.mjs — do not edit. */\n` +
    `import * as stylex from '@stylexjs/stylex';\n\n` +
    `export const tokens = stylex.defineVars({\n${entries.join('\n')}\n});\n`
  );
}

/** Panda: a preset keeps tokens and semanticTokens in Panda's own two-tier shape. */
function emitPandaPreset(resolvedByTheme, flatByTheme, themeNames) {
  const dflt = themeNames.includes(config.defaultTheme) ? config.defaultTheme : themeNames[0];
  const dark = themeNames.find((t) => t === config.darkTheme);
  const nest = (target, path, value) => {
    const parts = path.split('.');
    let node = target;
    parts.forEach((p, i) => (i === parts.length - 1 ? (node[p] = value) : (node = node[p] ??= {})));
  };
  const tokens = {};
  const semanticTokens = {};
  for (const [path, value] of flatByTheme.get(dflt)) {
    const own = resolvedByTheme.get(dflt).get(path);
    if (tier(path, own ?? {}) === 'primitive') nest(tokens, path, { value });
    else {
      const dv = dark ? flatByTheme.get(dark).get(path) ?? value : value;
      nest(semanticTokens, path, { value: dv !== value ? { base: value, _dark: dv } : value });
    }
  }
  return (
    `/* GENERATED by tokens/build.mjs — do not edit. */\n` +
    `import { definePreset } from '@pandacss/dev';\n\n` +
    `export default definePreset({\n  name: 'design-system',\n  theme: {\n    tokens: ${JSON.stringify(
      tokens,
      null,
      6,
    )},\n    semanticTokens: ${JSON.stringify(semanticTokens, null, 6)},\n  },\n});\n`
  );
}

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------

function die(msg) {
  console.error(`\n✗ token build failed\n  ${msg}\n`);
  process.exit(1);
}

function main() {
  const { base, themes, component, densities, brands } = loadTokenFiles();
  const themeNames = [...themes.keys()].sort((a, b) =>
    a === config.defaultTheme ? -1 : b === config.defaultTheme ? 1 : a.localeCompare(b),
  );

  /** base ← semantic.<theme> ← component ← overlays (brand / density modes layer on the assembled default). */
  const buildSpace = (theme, overlays = []) => {
    const space = new Map(base);
    for (const [k, v] of themes.get(theme)) space.set(k, v);
    for (const file of component) for (const [k, v] of file) space.set(k, v);
    for (const o of overlays) for (const [k, v] of o) space.set(k, v);
    return space;
  };

  const toVars = (resolved) => {
    const vars = new Map();
    const flat = new Map();
    for (const [, tk] of resolved) {
      for (const [path, value] of expand(tk)) {
        vars.set(varName(path), value);
        flat.set(path, value);
      }
    }
    return { vars, flat };
  };

  const resolvedByTheme = new Map();
  const themeVars = new Map(); // theme -> Map<cssVarName, value>
  const flatByTheme = new Map(); // theme -> Map<tokenPath, value>, composites already expanded
  const contrastReport = [];
  let failures = [];

  for (const theme of themeNames) {
    const resolved = resolveAll(buildSpace(theme));
    resolvedByTheme.set(theme, resolved);

    const { vars, flat } = toVars(resolved);
    themeVars.set(theme, vars);
    flatByTheme.set(theme, flat);

    const r = checkContrast(theme, resolved);
    failures = failures.concat(r.failures);
    contrastReport.push(...r.checked);
  }

  // Densities: re-value existing tokens only, and identically in every theme. A colour that
  // shifts with density would need per-theme handling nothing downstream expects.
  const densityVars = new Map(); // density -> Map<cssVarName, value> (only the changed vars)
  const knownPaths = new Set(buildSpace(themeNames[0]).keys());
  for (const [dname, overrides] of densities) {
    for (const path of overrides.keys()) {
      if (!knownPaths.has(path))
        die(
          `density.${dname} re-values unknown token "${path}" — density files may only override existing tokens\n` +
            `  (a new token here would only exist under [data-density='${dname}'] and break everywhere else)`,
        );
    }
    let diff = null;
    for (const theme of themeNames) {
      const { vars } = toVars(resolveAll(buildSpace(theme, [overrides])));
      const d = diffVars(themeVars.get(theme), vars);
      if (!diff) diff = d;
      else if (diff.size !== d.size || [...diff].some(([k, v]) => d.get(k) !== v))
        die(
          `density.${dname} resolves to different values in different themes — density overrides must be\n` +
            `  theme-independent (dimensions and numbers, never colours)`,
        );
    }
    densityVars.set(dname, diff);
  }

  // Brands: a full token space per (brand, theme), so references re-resolve against the
  // brand's primitives and the contrast gate runs on what will actually render.
  const brandVars = new Map(); // brand -> Map<theme, full varsMap>
  for (const [bname, entry] of brands) {
    for (const t of entry.themes.keys()) {
      if (!themes.has(t))
        die(`brand.${bname}.${t}.tokens.json names unknown theme "${t}" — themes present: ${themeNames.join(', ')}`);
    }
    if (entry.themes.size && entry.themes.size < themeNames.length) {
      const missing = themeNames.filter((t) => !entry.themes.has(t));
      console.warn(
        `⚠ brand "${bname}" has theme file(s) for ${[...entry.themes.keys()].join(', ')} but not ${missing.join(
          ', ',
        )} — missing themes keep the base semantics`,
      );
    }
    const perTheme = new Map();
    for (const theme of themeNames) {
      const overlays = [entry.shared, entry.themes.get(theme)].filter(Boolean);
      if (!overlays.length) {
        perTheme.set(theme, themeVars.get(theme));
        continue;
      }
      const resolved = resolveAll(buildSpace(theme, overlays));
      const r = checkContrast(`${bname}/${theme}`, resolved);
      failures = failures.concat(r.failures);
      contrastReport.push(...r.checked);
      perTheme.set(theme, toVars(resolved).vars);
    }
    brandVars.set(bname, perTheme);
  }

  // The config is the brief; the files are the implementation. Flag declared modes with no file.
  for (const d of (config.density ?? []).slice(1)) {
    if (!densities.has(d))
      console.warn(`⚠ config declares density "${d}" but tokens/density.${d}.tokens.json does not exist — [data-density='${d}'] will change nothing`);
  }
  for (const b of config.brands ?? []) {
    if (!brandVars.has(b))
      console.warn(`⚠ config declares brand "${b}" but no brand.${b}[.<theme>].tokens.json exists — [data-brand='${b}'] will render the default brand`);
  }

  mkdirSync(OUT, { recursive: true });
  const written = [];
  const write = (name, content) => {
    writeFileSync(join(OUT, name), content);
    written.push(name);
  };

  write('tokens.css', emitCss(themeVars, themeNames, densityVars, brandVars));
  write('tokens.ts', emitTs(flatByTheme, themeNames));
  write(
    'tokens.json',
    emitJson(resolvedByTheme, flatByTheme, themeNames, contrastReport, {
      densities: [...densityVars.keys()],
      brands: [...brandVars.keys()],
    }),
  );

  switch (config.cssSystem) {
    case 'tailwind':
      write('theme.css', emitTailwind(flatByTheme, themeNames));
      break;
    case 'vanilla-extract':
      write('contract.css.ts', emitVanillaExtract(flatByTheme, themeNames));
      break;
    case 'stylex':
      write('tokens.stylex.ts', emitStylex(flatByTheme, themeNames));
      break;
    case 'panda':
      write('preset.ts', emitPandaPreset(resolvedByTheme, flatByTheme, themeNames));
      break;
    default:
      break; // css-modules and plain CSS consume tokens.css directly
  }

  const total = themeVars.get(themeNames[0]).size;
  console.log(`✓ ${total} tokens × ${themeNames.length} theme(s): ${themeNames.join(', ')}`);
  if (densityVars.size)
    console.log(`  density: ${[...densityVars].map(([n, d]) => `${n} (${d.size} vars)`).join(', ')}`);
  if (brandVars.size)
    console.log(`  brands: ${[...brandVars.keys()].join(', ')} (contrast-gated per theme)`);
  console.log(`  → tokens/dist/{${written.join(', ')}}`);
  console.log(`  contrast: ${contrastReport.filter((c) => c.pass).length}/${contrastReport.length} pairs pass`);

  if (failures.length) {
    console.error(`\n✗ contrast gate failed (${config.contrast?.level ?? 'AA'}):\n${failures.join('\n')}`);
    console.error(
      `\n  Fix the token, don't lower the gate. If a pair is genuinely exempt (decorative,\n` +
        `  never text), mark it in the token's $extensions["design-system"].contrast.\n`,
    );
    if (config.contrast?.enforce !== false) process.exit(1);
  }
}

main();
