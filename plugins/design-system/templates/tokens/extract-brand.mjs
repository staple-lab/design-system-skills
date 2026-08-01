#!/usr/bin/env node
/**
 * extract-brand.mjs — find the brand colours in assets you already have.
 *
 *   node tokens/extract-brand.mjs --dir ./brand
 *   node tokens/extract-brand.mjs --url https://example.com
 *   node tokens/extract-brand.mjs --file logo.svg --file brand.css --json
 *
 * The interview asks "where does the colour system come from". This is the
 * answer for the common case: the brand already exists as a logo, a stylesheet
 * or a live site, and nobody remembers the hex.
 *
 * Reads every colour literal out of vector and text sources, clusters them in
 * OKLab so near-duplicates collapse, separates chromatic candidates from
 * neutrals, and ranks what is left. Prints the contrast each candidate would
 * have as a solid fill with white text — the same measure the token build's
 * contrast gate applies — so you can see before generating a ramp whether an
 * accent is going to need the light-peaking re-point.
 *
 * SCOPE, stated plainly: this reads sources where colour is *specified* —
 * .svg, .css, .html, .json, .md and code files. It does NOT decode raster
 * images or PDFs. A logo that exists only as a .png or a brand guideline that
 * exists only as a .pdf must be read visually instead; the script lists what it
 * skipped so that gap is never silent.
 *
 * Dependency-free Node ESM, like every script in this directory: it runs in CI,
 * in a pre-commit hook, and on a designer's machine that has never run
 * `npm install`. (`--url` uses the built-in global fetch.)
 */

import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, extname, basename, relative } from 'node:path';

// --------------------------------------------------------------------------
// Args
// --------------------------------------------------------------------------
const argv = process.argv.slice(2);
const opts = { dirs: [], files: [], urls: [], top: 8, json: false };
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === '--dir') opts.dirs.push(argv[++i]);
  else if (a === '--file') opts.files.push(argv[++i]);
  else if (a === '--url') opts.urls.push(argv[++i]);
  else if (a === '--top') opts.top = Number(argv[++i]) || 8;
  else if (a === '--json') opts.json = true;
  else if (a === '--help' || a === '-h') { usage(); process.exit(0); }
  else if (a.startsWith('--')) die(`unknown option ${a}`);
  else opts.dirs.push(a);
}
if (!opts.dirs.length && !opts.files.length && !opts.urls.length) { usage(); process.exit(1); }

function usage() {
  console.log(`
extract-brand — brand colour candidates from assets you already have

  node tokens/extract-brand.mjs --dir ./brand
  node tokens/extract-brand.mjs --url https://example.com
  node tokens/extract-brand.mjs --file logo.svg --file tokens.json --top 12 --json

  --dir <path>    scan a folder recursively (node_modules, .git, dist skipped)
  --file <path>   scan one file; repeatable
  --url <url>     fetch a page and its linked stylesheets
  --top <n>       how many candidates to print (default 8)
  --json          machine-readable output
`);
}
function die(msg) { console.error(`\n✗ extract-brand failed\n  ${msg}\n`); process.exit(1); }

// --------------------------------------------------------------------------
// Colour maths. Self-contained on purpose — every script in this directory
// runs standalone, so each carries the conversions it needs.
// --------------------------------------------------------------------------
const srgbToLinear = (v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);

function rgbToOklab([r, g, b]) {
  const [lr, lg, lb] = [r, g, b].map(srgbToLinear);
  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb);
  const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb);
  const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb);
  return {
    L: 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    a: 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    b: 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  };
}
function toOklch(rgb) {
  const { L, a, b } = rgbToOklab(rgb);
  const C = Math.hypot(a, b);
  let H = (Math.atan2(b, a) * 180) / Math.PI;
  if (H < 0) H += 360;
  return { L, C, H };
}
const relLum = ([r, g, b]) => {
  const [lr, lg, lb] = [r, g, b].map(srgbToLinear);
  return 0.2126 * lr + 0.7152 * lg + 0.0722 * lb;
};
const contrastVsWhite = (rgb) => 1.05 / (relLum(rgb) + 0.05);
const hex = ([r, g, b]) =>
  '#' + [r, g, b].map((v) => Math.round(Math.min(1, Math.max(0, v)) * 255).toString(16).padStart(2, '0')).join('');

// --------------------------------------------------------------------------
// Colour literal parsing
// --------------------------------------------------------------------------
const PATTERNS = [
  /#([0-9a-fA-F]{8})\b/g,
  /#([0-9a-fA-F]{6})\b/g,
  /#([0-9a-fA-F]{3,4})\b/g,
  /\brgba?\(\s*([0-9.]+%?)\s*[, ]\s*([0-9.]+%?)\s*[, ]\s*([0-9.]+%?)\s*(?:[,/]\s*[0-9.%]+\s*)?\)/g,
  /\bhsla?\(\s*([0-9.]+)(?:deg)?\s*[, ]\s*([0-9.]+)%\s*[, ]\s*([0-9.]+)%\s*(?:[,/]\s*[0-9.%]+\s*)?\)/g,
  /\boklch\(\s*([0-9.]+)%?\s+([0-9.]+)\s+([0-9.]+)(?:deg)?\s*(?:\/\s*[0-9.%]+\s*)?\)/g,
];

const num = (v) => (String(v).endsWith('%') ? (parseFloat(v) / 100) * 255 : parseFloat(v));

function hslToRgb(h, s, l) {
  h = ((h % 360) + 360) % 360; s /= 100; l /= 100;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  const seg = [[c, x, 0], [x, c, 0], [0, c, x], [0, x, c], [x, 0, c], [c, 0, x]][Math.floor(h / 60) % 6];
  return seg.map((v) => v + m);
}

function oklchToRgb(L, C, H) {
  const h = (H * Math.PI) / 180;
  const a = C * Math.cos(h), b2 = C * Math.sin(h);
  const l_ = (L + 0.3963377774 * a + 0.2158037573 * b2) ** 3;
  const m_ = (L - 0.1055613458 * a - 0.0638541728 * b2) ** 3;
  const s_ = (L - 0.0894841775 * a - 1.291485548 * b2) ** 3;
  const lin = [
    4.0767416621 * l_ - 3.3077115913 * m_ + 0.2309699292 * s_,
    -1.2684380046 * l_ + 2.6097574011 * m_ - 0.3413193965 * s_,
    -0.0041960863 * l_ - 0.7034186147 * m_ + 1.707614701 * s_,
  ];
  return lin.map((v) => (v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055));
}

/** Every colour literal in a blob of text, as sRGB triples (0..1). */
function extractColors(text) {
  const found = [];
  const seenSpan = new Set();
  for (const re of PATTERNS) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(text))) {
      // A 6-digit hex would also match the 3-digit pattern at the same offset;
      // first pattern to claim a span wins, and they run longest-first.
      const span = m.index;
      if (seenSpan.has(span)) continue;
      const rgb = parseOne(m);
      if (rgb && rgb.every((v) => Number.isFinite(v))) { found.push(rgb); seenSpan.add(span); }
    }
  }
  return found;
}

function parseOne(m) {
  const raw = m[0];
  if (raw.startsWith('#')) {
    let h = m[1];
    if (h.length === 3 || h.length === 4) h = h.slice(0, 3).split('').map((c) => c + c).join('');
    else h = h.slice(0, 6);
    return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
  }
  if (raw.startsWith('rgb')) return [num(m[1]) / 255, num(m[2]) / 255, num(m[3]) / 255];
  if (raw.startsWith('hsl')) return hslToRgb(parseFloat(m[1]), parseFloat(m[2]), parseFloat(m[3]));
  if (raw.startsWith('oklch')) {
    const L = parseFloat(m[1]) > 1 ? parseFloat(m[1]) / 100 : parseFloat(m[1]);
    return oklchToRgb(L, parseFloat(m[2]), parseFloat(m[3]));
  }
  return null;
}

// --------------------------------------------------------------------------
// Sources
// --------------------------------------------------------------------------
const TEXTUAL = new Set(['.svg', '.css', '.scss', '.sass', '.less', '.html', '.htm', '.xml',
  '.json', '.md', '.txt', '.js', '.jsx', '.ts', '.tsx', '.vue', '.astro']);
const OPAQUE = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.avif', '.pdf', '.ai',
  '.sketch', '.fig', '.psd', '.eps', '.tif', '.tiff', '.ico']);
const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build', 'coverage', '.next', 'out']);

const samples = [];   // { rgb, source }
const scanned = [];
const skipped = [];

function addText(text, source) {
  const found = extractColors(text);
  for (const rgb of found) samples.push({ rgb, source });
  scanned.push({ source, colors: found.length });
}

function walkDir(dir) {
  if (!existsSync(dir)) die(`no such directory: ${dir}`);
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const p = join(dir, name);
    let st;
    try { st = statSync(p); } catch { continue; }
    if (st.isDirectory()) walkDir(p);
    else readFile(p);
  }
}

function readFile(p) {
  const ext = extname(p).toLowerCase();
  if (OPAQUE.has(ext)) { skipped.push(p); return; }
  if (!TEXTUAL.has(ext)) return;
  try { addText(readFileSync(p, 'utf8'), p); } catch { /* unreadable; ignore */ }
}

async function readUrl(url) {
  const get = async (u) => {
    const res = await fetch(u, { redirect: 'follow', headers: { 'user-agent': 'extract-brand/1.0' } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.text();
  };
  let html;
  try { html = await get(url); } catch (e) { die(`could not fetch ${url}: ${e.message}`); }
  addText(html, url);

  const hrefs = [...html.matchAll(/<link\b[^>]*rel=["']?stylesheet["']?[^>]*>/gi)]
    .map((tag) => /href=["']([^"']+)["']/i.exec(tag[0]))
    .filter(Boolean)
    .map((m) => m[1])
    .slice(0, 10);
  for (const href of hrefs) {
    let abs;
    try { abs = new URL(href, url).toString(); } catch { continue; }
    try { addText(await get(abs), abs); }
    catch (e) { skipped.push(`${abs} (${e.message})`); }
  }
}

// --------------------------------------------------------------------------
// Cluster + rank
// --------------------------------------------------------------------------
const NEUTRAL_CHROMA = 0.03;   // below this, it is a grey/black/white, not a brand hue
const MERGE_DIST = 0.025;      // OKLab distance at which two literals are "the same colour"

function cluster(list) {
  const out = [];
  for (const s of list) {
    const lab = rgbToOklab(s.rgb);
    let hit = null;
    for (const c of out) {
      const d = Math.hypot(c.lab.L - lab.L, c.lab.a - lab.a, c.lab.b - lab.b);
      if (d < MERGE_DIST) { hit = c; break; }
    }
    if (hit) { hit.count++; hit.sources.add(s.source); }
    else out.push({ lab, rgb: s.rgb, count: 1, sources: new Set([s.source]) });
  }
  return out;
}

function describe(c) {
  const lch = toOklch(c.rgb);
  const ratio = contrastVsWhite(c.rgb);
  return {
    hex: hex(c.rgb),
    oklch: `oklch(${(lch.L * 100).toFixed(1)}% ${lch.C.toFixed(3)} ${lch.H.toFixed(0)})`,
    count: c.count,
    chroma: +lch.C.toFixed(3),
    lightness: +lch.L.toFixed(3),
    hue: +lch.H.toFixed(0),
    whiteTextContrast: +ratio.toFixed(2),
    solidFillReady: ratio >= 4.5,
    sources: [...c.sources].slice(0, 3),
  };
}

// --------------------------------------------------------------------------
// Run
// --------------------------------------------------------------------------
for (const f of opts.files) { if (!existsSync(f)) die(`no such file: ${f}`); readFile(f); }
for (const d of opts.dirs) walkDir(d);
for (const u of opts.urls) await readUrl(u);

if (!samples.length) {
  const hint = skipped.length
    ? `\n  ${skipped.length} file(s) were skipped because this script does not decode them:\n` +
      skipped.slice(0, 8).map((p) => `    ${basename(p)}`).join('\n') +
      `\n  Read those visually and pass the colours with: generate-ramps.mjs --accent "#RRGGBB"`
    : '';
  die(`no colour literals found in ${scanned.length} scanned source(s).${hint}`);
}

const clusters = cluster(samples).sort((a, b) => b.count - a.count);
const chromatic = clusters.filter((c) => toOklch(c.rgb).C >= NEUTRAL_CHROMA);
const neutrals = clusters.filter((c) => toOklch(c.rgb).C < NEUTRAL_CHROMA);

const candidates = chromatic.slice(0, opts.top).map(describe);
const neutralList = neutrals.slice(0, 4).map(describe);

if (opts.json) {
  console.log(JSON.stringify({
    scanned: scanned.length,
    literals: samples.length,
    skipped,
    candidates,
    neutrals: neutralList,
    suggested: candidates[0]?.hex ?? null,
  }, null, 2));
  process.exit(0);
}

const rel = (p) => (p.startsWith('http') ? p : relative(process.cwd(), p));

console.log(`\nBrand colour candidates — ${samples.length} literals across ${scanned.length} source(s)\n`);
if (!candidates.length) {
  console.log('  No chromatic colours found — every literal was a grey, black or white.');
} else {
  for (const [i, c] of candidates.entries()) {
    const gate = c.solidFillReady
      ? `white text ${c.whiteTextContrast}:1 — clears 4.5:1 as a solid fill`
      : `white text ${c.whiteTextContrast}:1 — light-peaking, its ramp will re-point the fill a step darker`;
    console.log(`  ${i === 0 ? '→' : ' '} ${c.hex}  ${c.oklch.padEnd(26)} ×${String(c.count).padEnd(4)} ${gate}`);
    console.log(`      ${c.sources.map(rel).join(', ')}`);
  }
}
if (neutralList.length) {
  console.log(`\n  Neutrals (chroma < ${NEUTRAL_CHROMA}), reported but never picked as an accent:`);
  console.log('    ' + neutralList.map((n) => `${n.hex} ×${n.count}`).join('  '));
}
if (skipped.length) {
  console.log(`\n  ⚠ ${skipped.length} source(s) not decoded — this script reads vector and text formats only:`);
  for (const p of skipped.slice(0, 8)) console.log(`      ${rel(p)}`);
  if (skipped.length > 8) console.log(`      … and ${skipped.length - 8} more`);
  console.log('    Read those visually and add any colour they contribute by hand.');
}
if (candidates.length) {
  console.log(`\n  Next:  node tokens/generate-ramps.mjs --accent "${candidates[0].hex}"\n`);
}
