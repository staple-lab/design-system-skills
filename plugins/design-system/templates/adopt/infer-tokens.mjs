#!/usr/bin/env node
/**
 * Token inference for brownfield adoption — scan a codebase's hardcoded values
 * and propose the token layer that would cover them.
 *
 * What it finds: colours (hex/rgb/hsl/oklch), px dimensions, font sizes,
 * durations, z-indexes — in CSS/SCSS files and in TSX/JSX inline styles and
 * CSS-in-JS template literals.
 *
 * What it proposes:
 *   - the five primitive colour ramps (neutral/accent/success/warning/danger),
 *     generated from the codebase's own hues using the ramp recipe in the
 *     design-tokens skill's references/scales.md (L per step, C relative to a
 *     peak, hue from the OKLCH cluster) — then every found colour is mapped to
 *     its nearest ramp step;
 *   - a 4px-grid snap map for dimensions (space.* scale);
 *   - duration.* and z.* assignments.
 *
 * Output:
 *   .design-system/adopt/value-map.json    literal → proposed token, confidence,
 *                                          count, files — the codemod's input
 *   stdout                                 a coverage report (dry run by default)
 *
 * Modes:
 *   --write        also emit tokens/primitive.tokens.json (colour ramps only —
 *                  semantic + component files come from the design-tokens skill)
 *   --rewrite-css  rewrite EXACT-confidence literals in CSS files to var(--<prefix>-*).
 *                  Exact means the literal equals the proposed token's value after
 *                  normalisation; "nearest" matches are a migration decision, not
 *                  a mechanical rewrite, and stay in the plan.
 *   --dir <path>   scan root (default: cwd)
 *   --prefix <p>   CSS var prefix (default: read tokens.prefix from
 *                  design-system.config.json, else "ds")
 *
 * Dependency-free Node ESM, same OKLCH math as tokens/build.mjs (duplicated
 * deliberately: this runs in brownfield repos that have no tokens/ yet, and
 * every template must run standalone).
 *
 * Tailwind projects: if tailwindcss is in package.json, the palette should come
 * from tokens/import-palette.mjs (the project already HAS a palette — inferring
 * one from rendered values reverse-engineers it badly). This script says so and
 * limits itself to non-colour values there unless --force-colors is passed.
 */

import { readFileSync, writeFileSync, readdirSync, statSync, existsSync, mkdirSync } from 'node:fs';
import { join, relative, extname } from 'node:path';

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

const args = { dir: process.cwd(), write: false, rewriteCss: false, forceColors: false, prefix: null };
{
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--write') args.write = true;
    else if (a === '--rewrite-css') args.rewriteCss = true;
    else if (a === '--force-colors') args.forceColors = true;
    else if (a === '--dir') args.dir = argv[++i];
    else if (a === '--prefix') args.prefix = argv[++i];
    else if (a === '--help' || a === '-h') {
      console.log('Usage: node infer-tokens.mjs [--dir <path>] [--write] [--rewrite-css] [--prefix ds] [--force-colors]');
      process.exit(0);
    } else { console.error(`Unknown argument: ${a}`); process.exit(1); }
  }
}
if (!args.prefix) {
  try {
    const cfg = JSON.parse(readFileSync(join(args.dir, 'design-system.config.json'), 'utf8'));
    args.prefix = cfg?.tokens?.prefix ?? 'ds';
  } catch { args.prefix = 'ds'; }
}

// ---------------------------------------------------------------------------
// Colour math: sRGB ⇄ OKLCH (same formulas as tokens/build.mjs)
// ---------------------------------------------------------------------------

function srgbToLinear(v) { return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }
function linearToSrgb(v) { return v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055; }

function rgbToOklch([r, g, b]) {
  const [lr, lg, lb] = [r, g, b].map(srgbToLinear);
  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb);
  const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb);
  const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb);
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  const C = Math.hypot(A, B);
  const H = ((Math.atan2(B, A) * 180) / Math.PI + 360) % 360;
  return { L, C, H };
}

function oklchToRgb({ L, C, H }) {
  const A = C * Math.cos((H * Math.PI) / 180);
  const B = C * Math.sin((H * Math.PI) / 180);
  const l = (L + 0.3963377774 * A + 0.2158037573 * B) ** 3;
  const m = (L - 0.1055613458 * A - 0.0638541728 * B) ** 3;
  const s = (L - 0.0894841775 * A - 1.291485548 * B) ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ].map((v) => Math.min(1, Math.max(0, linearToSrgb(v))));
}

function inGamut({ L, C, H }) {
  const A = C * Math.cos((H * Math.PI) / 180);
  const B = C * Math.sin((H * Math.PI) / 180);
  const l = (L + 0.3963377774 * A + 0.2158037573 * B) ** 3;
  const m = (L - 0.1055613458 * A - 0.0638541728 * B) ** 3;
  const s = (L - 0.0894841775 * A - 1.291485548 * B) ** 3;
  const lin = [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
  return lin.every((v) => v >= -1e-6 && v <= 1 + 1e-6);
}

function clampChroma(c) {
  let { L, C, H } = c;
  while (C > 0 && !inGamut({ L, C, H })) C -= 0.002;
  return { L, C: Math.max(0, C), H };
}

function parseColor(str) {
  const s = str.trim().toLowerCase();
  let m;
  if ((m = /^#([0-9a-f]{3})$/.exec(s)))
    return rgbToOklch([...m[1]].map((c) => parseInt(c + c, 16) / 255));
  if ((m = /^#([0-9a-f]{6})([0-9a-f]{2})?$/.exec(s)))
    return rgbToOklch(m[1].match(/../g).map((c) => parseInt(c, 16) / 255));
  if ((m = /^rgba?\(([^)]+)\)$/.exec(s))) {
    const p = m[1].split(/[,/\s]+/).filter(Boolean).slice(0, 3)
      .map((v) => (v.endsWith('%') ? (parseFloat(v) / 100) * 255 : parseFloat(v)));
    if (p.length === 3 && p.every((v) => !Number.isNaN(v))) return rgbToOklch(p.map((v) => v / 255));
  }
  if ((m = /^hsla?\(([^)]+)\)$/.exec(s))) {
    const p = m[1].split(/[,/\s]+/).filter(Boolean);
    const h = parseFloat(p[0]); const sat = parseFloat(p[1]) / 100; const l = parseFloat(p[2]) / 100;
    if ([h, sat, l].some(Number.isNaN)) return null;
    const f = (n) => { const k = (n + h / 30) % 12; return l - sat * Math.min(l, 1 - l) * Math.max(-1, Math.min(k - 3, 9 - k, 1)); };
    return rgbToOklch([f(0), f(8), f(4)]);
  }
  if ((m = /^oklch\(([^)]+)\)$/.exec(s))) {
    const p = m[1].split('/')[0].trim().split(/\s+/);
    const L = p[0].endsWith('%') ? parseFloat(p[0]) / 100 : parseFloat(p[0]);
    const c = { L, C: parseFloat(p[1] ?? '0'), H: parseFloat(p[2] ?? '0') };
    return [c.L, c.C, c.H].some(Number.isNaN) ? null : c; // template-literal fragments parse to NaN
  }
  return null;
}

function fmtOklch({ L, C, H }) {
  return `oklch(${+(L * 100).toFixed(2)}% ${+C.toFixed(4)} ${+H.toFixed(3)})`;
}

// ---------------------------------------------------------------------------
// Scan
// ---------------------------------------------------------------------------

// 'tokens' is skipped because it is the design system's own layer — the DTCG
// sources and build.mjs are full of colour strings that are the CURE, not the
// drift. A product directory that happens to be called tokens/ can be scanned
// by pointing --dir at it directly.
const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build', 'out', '.next', 'coverage', '.design-system', 'tokens']);
const CSS_EXT = new Set(['.css', '.scss', '.less']);
const JS_EXT = new Set(['.tsx', '.jsx', '.ts', '.js', '.mjs', '.vue', '.svelte']);

function* walk(dir) {
  let entries;
  try { entries = readdirSync(dir); } catch { return; }
  for (const name of entries) {
    if (SKIP_DIRS.has(name)) continue;
    const p = join(dir, name);
    let st; try { st = statSync(p); } catch { continue; }
    if (st.isDirectory()) yield* walk(p);
    else if (CSS_EXT.has(extname(name)) || JS_EXT.has(extname(name))) yield p;
  }
}

// found: Map<literal, {kind, count, files:Set}>
const found = new Map();
function record(literal, kind, file) {
  const key = `${kind}:${literal}`;
  const e = found.get(key) ?? { literal, kind, count: 0, files: new Set() };
  e.count++; e.files.add(relative(args.dir, file));
  found.set(key, e);
}

const COLOR_RE = /#[0-9a-fA-F]{3,8}\b|(?:rgba?|hsla?|oklch)\([^)]+\)/g;
const PX_PROP_RE = /(?:margin|padding|gap|top|right|bottom|left|width|height|inset|border-radius|font-size|line-height|min-width|max-width|min-height|max-height|row-gap|column-gap)[^:;{}]*:\s*([^;}{]+)/gi;
const Z_RE = /z-index\s*:\s*(-?\d+)/gi;
const DUR_RE = /\b(\d+(?:\.\d+)?)(ms|s)\b/g;
const TRANSITION_PROP_RE = /(?:transition|animation)[^:;{}]*:\s*([^;}{]+)/gi;

function scanText(text, file, isCss) {
  // Colours: everywhere in CSS; in JS only inside string literals / template text
  for (const m of text.matchAll(COLOR_RE)) {
    if (parseColor(m[0])) record(m[0].toLowerCase(), 'color', file);
  }
  const scanDecls = (t) => {
    for (const m of t.matchAll(PX_PROP_RE)) {
      const isType = /font-size|line-height/i.test(m[0]);
      for (const px of m[1].matchAll(/(-?\d+(?:\.\d+)?)px/g)) {
        const v = parseFloat(px[1]);
        if (v !== 0 && v === Math.round(v) && Math.abs(v) <= 128)
          record(`${v}px`, isType ? 'font-size' : 'dimension', file);
      }
    }
    for (const m of t.matchAll(Z_RE)) record(m[1], 'z-index', file);
    for (const m of t.matchAll(TRANSITION_PROP_RE)) {
      for (const d of m[1].matchAll(DUR_RE)) {
        const ms = d[2] === 's' ? parseFloat(d[1]) * 1000 : parseFloat(d[1]);
        if (ms >= 40 && ms <= 2000) record(`${ms}ms`, 'duration', file);
      }
    }
  };
  if (isCss) scanDecls(text);
  else {
    // inline style objects: paddingTop: 16 / padding: '16px' — plus template-literal CSS
    for (const m of text.matchAll(/(margin|padding|gap|top|width|height|fontSize|lineHeight|borderRadius)[A-Za-z]*\s*:\s*(\d+)\b/g)) {
      const v = parseInt(m[2], 10);
      if (v !== 0 && v <= 128)
        record(`${v}px`, /fontSize|lineHeight/.test(m[1]) ? 'font-size' : 'dimension', file);
    }
    for (const m of text.matchAll(/zIndex\s*:\s*(-?\d+)/g)) record(m[1], 'z-index', file);
    for (const tpl of text.matchAll(/`[^`]*`/gs)) scanDecls(tpl[0]);
  }
}

// ---------------------------------------------------------------------------
// Cluster colours → five ramps
// ---------------------------------------------------------------------------

// Ramp recipe from the design-tokens skill's references/scales.md (chromatic),
// and the shipped neutral's own L column (templates/tokens/primitive.tokens.json):
// the neutral 400–700 stretch runs darker than the chromatic recipe because its
// 500/600 carry the dual text constraints (fg.subtle ≥3:1 on near-white AND
// fg.muted ≥4.5:1 on near-black, and mirrored) that decorative chromatic steps
// don't. Reusing the chromatic L there fails the gate by design.
const STEP_RECIPE = [
  ['50', 0.977, 0.07], ['100', 0.955, 0.14], ['200', 0.925, 0.26], ['300', 0.883, 0.41],
  ['400', 0.82, 0.61], ['500', 0.72, 0.84], ['600', 0.565, 1.0], ['700', 0.5, 0.97],
  ['800', 0.445, 0.86], ['900', 0.4, 0.73], ['950', 0.29, 0.51], ['1000', 0.19, 0.32],
];
const NEUTRAL_RECIPE = [
  ['50', 0.985, 0.2], ['100', 0.968, 0.3], ['200', 0.935, 0.5], ['300', 0.89, 0.7],
  ['400', 0.79, 1.0], ['500', 0.645, 1.2], ['600', 0.545, 1.3], ['700', 0.47, 1.3],
  ['800', 0.375, 1.2], ['900', 0.285, 1.0], ['950', 0.205, 0.8], ['1000', 0.145, 0.6],
];

function bucketOf({ C, H }) {
  if (C < 0.03) return 'neutral';
  if (H < 45 || H >= 345) return 'danger';
  if (H < 110) return 'warning';
  if (H < 200) return 'success';
  return 'accent'; // blues, purples, pinks — the classic brand range
}

// Deterministic weighted circular-mean hue + peak chroma per bucket
function summarize(colors) {
  let x = 0, y = 0, n = 0, peakC = 0;
  for (const { oklch, count } of colors) {
    x += Math.cos((oklch.H * Math.PI) / 180) * count;
    y += Math.sin((oklch.H * Math.PI) / 180) * count;
    peakC = Math.max(peakC, oklch.C);
    n += count;
  }
  const H = n ? ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360 : 0;
  return { H: +H.toFixed(3), peakC, n };
}

const DEFAULT_HUES = { accent: 258, success: 150, warning: 80, danger: 25, neutral: 258 };

function buildRamp(role, cluster) {
  const hue = cluster.n ? cluster.H : DEFAULT_HUES[role];
  const peak = role === 'neutral'
    ? 0.01 // slightly tinted neutral, pulled toward the brand hue (scales.md)
    : Math.min(0.22, Math.max(0.12, cluster.n ? cluster.peakC : 0.185));
  const recipe = role === 'neutral' ? NEUTRAL_RECIPE : STEP_RECIPE;
  const ramp = {};
  for (const [step, L, cf] of recipe) {
    const c = clampChroma({ L, C: peak * cf, H: hue });
    ramp[step] = {
      $value: fmtOklch(c),
      $description: `Inferred from codebase hues by adopt/infer-tokens.mjs (${cluster.n ? `${cluster.n} occurrence(s), hue ${hue}` : `no ${role} colours found — recipe default hue ${hue}`}). Verify contrast with tokens/build.mjs.`,
    };
  }
  return ramp;
}

// ---------------------------------------------------------------------------
// Assignment
// ---------------------------------------------------------------------------

const SPACE_SCALE = { 0: 0, 1: 4, 2: 8, 3: 12, 4: 16, 5: 20, 6: 24, 8: 32, 10: 40, 12: 48, 16: 64, 20: 80, 24: 96 };
const DURATIONS = { instant: 50, fast: 150, normal: 250, slow: 400, slower: 600 };
const Z_SCALE = { base: 0, dropdown: 1000, sticky: 1100, overlay: 1200, modal: 1300, popover: 1400, toast: 1500, tooltip: 1600 };

function nearest(entries, value) {
  let best = null, bestD = Infinity;
  for (const [name, v] of entries) {
    const d = Math.abs(v - value);
    if (d < bestD) { bestD = d; best = [name, v]; }
  }
  return { name: best[0], value: best[1], distance: bestD };
}

function main() {
  // Tailwind short-circuit for colours
  let tailwindProject = false;
  try {
    const pkg = JSON.parse(readFileSync(join(args.dir, 'package.json'), 'utf8'));
    tailwindProject = Boolean({ ...pkg.dependencies, ...pkg.devDependencies }?.tailwindcss);
  } catch { /* no package.json — fine */ }

  let fileCount = 0;
  for (const f of walk(args.dir)) {
    fileCount++;
    scanText(readFileSync(f, 'utf8'), f, CSS_EXT.has(extname(f)));
  }

  const colors = [];
  const clusters = { neutral: [], accent: [], success: [], warning: [], danger: [] };
  for (const e of found.values()) {
    if (e.kind !== 'color') continue;
    const oklch = parseColor(e.literal);
    if (!oklch) continue;
    const entry = { ...e, oklch, bucket: bucketOf(oklch) };
    colors.push(entry);
    clusters[entry.bucket].push({ oklch, count: e.count });
  }

  const skipColors = tailwindProject && !args.forceColors;
  const ramps = {};
  if (!skipColors) {
    for (const role of Object.keys(clusters)) ramps[role] = buildRamp(role, summarize(clusters[role]));
  }

  // value map
  const map = [];
  const varName = (path) => `--${args.prefix}-${path.replace(/\./g, '-')}`;
  if (!skipColors) {
    for (const c of colors) {
      const ramp = ramps[c.bucket];
      let best = null, bestD = Infinity;
      for (const [step, tok] of Object.entries(ramp)) {
        const t = parseColor(tok.$value);
        const dH = Math.min(Math.abs(t.H - c.oklch.H), 360 - Math.abs(t.H - c.oklch.H)) / 360;
        const d = Math.hypot(t.L - c.oklch.L, t.C - c.oklch.C, dH * 0.5);
        if (d < bestD) { bestD = d; best = step; }
      }
      map.push({
        literal: c.literal, kind: 'color', count: c.count, files: [...c.files].sort(),
        token: `color.${c.bucket}.${best}`, var: varName(`color.${c.bucket}.${best}`),
        confidence: bestD < 0.02 ? 'exact' : 'nearest', distance: +bestD.toFixed(4),
        note: 'primitive-tier target — the migration should usually land on the SEMANTIC token that references it; the adoption plan decides which',
      });
    }
  }
  for (const e of found.values()) {
    if (e.kind === 'dimension') {
      const v = parseFloat(e.literal);
      const { name, value, distance } = nearest(Object.entries(SPACE_SCALE), v);
      map.push({
        literal: e.literal, kind: 'dimension', count: e.count, files: [...e.files].sort(),
        token: `space.${name}`, var: varName(`space.${name}`),
        confidence: distance === 0 ? 'exact' : 'snap', snappedFrom: distance === 0 ? undefined : `${v}px`, snappedTo: `${value}px`,
      });
    } else if (e.kind === 'duration') {
      const v = parseFloat(e.literal);
      const { name, distance } = nearest(Object.entries(DURATIONS), v);
      map.push({
        literal: e.literal, kind: 'duration', count: e.count, files: [...e.files].sort(),
        token: `duration.${name}`, var: varName(`duration.${name}`),
        confidence: distance === 0 ? 'exact' : 'snap',
      });
    } else if (e.kind === 'font-size') {
      // Type sizes map to ROLES (type.body, type.label…), not to a snap grid —
      // 14px might be body-sm or label, and only usage says which. Judgement call.
      map.push({
        literal: e.literal, kind: 'font-size', count: e.count, files: [...e.files].sort(),
        token: null, var: null, confidence: 'judgement',
        note: 'map to a type.* role by usage (body/body-sm/label/caption) — the type scale is role-named precisely so sizes are not picked by number',
      });
    } else if (e.kind === 'z-index') {
      const v = parseInt(e.literal, 10);
      const { name, distance } = nearest(Object.entries(Z_SCALE), v);
      map.push({
        literal: e.literal, kind: 'z-index', count: e.count, files: [...e.files].sort(),
        token: `z.${name}`, var: varName(`z.${name}`),
        confidence: distance === 0 ? 'exact' : 'nearest',
        note: v > 1600 ? `z-index ${v} exceeds the scale — usually a stacking-war artefact; the fix is the z scale, not a bigger number` : undefined,
      });
    }
  }
  map.sort((a, b) => b.count - a.count || a.literal.localeCompare(b.literal));

  // write outputs
  const outDir = join(args.dir, '.design-system', 'adopt');
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, 'value-map.json'), JSON.stringify({
    generatedBy: 'adopt/infer-tokens.mjs', prefix: args.prefix,
    tailwindProject, colorsSkipped: skipColors, entries: map,
  }, null, 2) + '\n');

  if (args.write && !skipColors) {
    const tokensDir = join(args.dir, 'tokens');
    mkdirSync(tokensDir, { recursive: true });
    const doc = { color: { $type: 'color' } };
    for (const [role, ramp] of Object.entries(ramps)) doc.color[role] = ramp;
    const target = join(tokensDir, 'primitive.tokens.json');
    if (existsSync(target)) {
      const existing = JSON.parse(readFileSync(target, 'utf8'));
      existing.color = { ...(existing.color ?? { $type: 'color' }), ...doc.color };
      writeFileSync(target, JSON.stringify(existing, null, 2) + '\n');
    } else {
      writeFileSync(target, JSON.stringify(doc, null, 2) + '\n');
    }
  }

  if (args.rewriteCss) {
    // Colours only: a colour literal is unambiguous, but `16px` inside a border
    // or box-shadow shorthand is not a space token — dimension/duration rewrites
    // are a codemod-with-context job, not a text substitution.
    const exactColors = map.filter((m) => m.confidence === 'exact' && m.kind === 'color');
    let rewrites = 0, filesTouched = 0;
    for (const f of walk(args.dir)) {
      if (!CSS_EXT.has(extname(f))) continue;
      let text = readFileSync(f, 'utf8');
      const before = text;
      for (const m of exactColors) {
        rewrites += before.split(m.literal).length - 1;
        text = text.split(m.literal).join(`var(${m.var})`);
      }
      if (text !== before) { writeFileSync(f, text); filesTouched++; }
    }
    console.log(`✎ rewrote ${rewrites} exact colour literal(s) in ${filesTouched} file(s)`);
  }

  // report
  const byKind = {};
  for (const m of map) {
    byKind[m.kind] ??= { literals: 0, occurrences: 0, exact: 0 };
    byKind[m.kind].literals++;
    byKind[m.kind].occurrences += m.count;
    if (m.confidence === 'exact') byKind[m.kind].exact += m.count;
  }
  console.log(`Scanned ${fileCount} file(s) under ${args.dir}`);
  if (tailwindProject) console.log(skipColors
    ? '⚠ Tailwind project: colour inference skipped — run tokens/import-palette.mjs --source tailwind instead (the project already has a palette; --force-colors overrides)'
    : '⚠ Tailwind project, --force-colors set: inferring colours anyway');
  for (const [kind, s] of Object.entries(byKind)) {
    console.log(`  ${kind.padEnd(10)} ${String(s.literals).padStart(4)} distinct literal(s), ${String(s.occurrences).padStart(5)} occurrence(s), ${s.exact} mechanically rewritable`);
  }
  if (!skipColors && colors.length) {
    for (const role of ['neutral', 'accent', 'success', 'warning', 'danger']) {
      const s = summarize(clusters[role]);
      console.log(`  ramp ${role.padEnd(8)} ${s.n ? `hue ${s.H} from ${s.n} occurrence(s)` : `no colours found — recipe default hue ${DEFAULT_HUES[role]}`}`);
    }
  }
  console.log(`\n→ .design-system/adopt/value-map.json (${map.length} entries)`);
  if (!args.write) console.log('Dry run: pass --write to emit tokens/primitive.tokens.json, then run tokens/build.mjs — the contrast gate is the arbiter of the inferred ramps.');
}

main();
