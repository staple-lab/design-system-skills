#!/usr/bin/env node
/**
 * Ramp generator — one brand hex → the five primitive colour ramps, using the
 * recipe in the design-tokens skill's references/scales.md (L per step, chroma
 * relative to a per-hue peak, OKLCH throughout, sRGB gamut clamped).
 *
 * Usage:
 *   node tokens/generate-ramps.mjs --accent "#7C3AED" [--dry-run]
 *   node tokens/generate-ramps.mjs --accent "#0B5FFF" --neutral-hue 258 \
 *        [--success "#16A34A" | --success 150] [--warning 80] [--danger 25]
 *
 * What it guarantees, and what it reports instead of guaranteeing:
 *   - The brand hex lands EXACTLY at its nearest step (by OKLCH lightness) —
 *     designers find their colour in the palette, not an approximation of it.
 *     Other steps follow the recipe around it.
 *   - The neutral ramp uses its own L column (templates/tokens shipped values):
 *     its 500/600 carry dual text constraints the chromatic recipe doesn't.
 *   - Contrast is MEASURED after generation, never assumed (scales.md's rule).
 *     Light-peaking hues (greens, ambers, oranges) cannot carry white text at
 *     600 no matter how the ramp is tuned — when that happens the ramp is NOT
 *     distorted; the script prints the fix (point color.bg.accent at the step
 *     that measured ≥4.5:1, usually 700) and stamps it into the $descriptions.
 *     Run tokens/build.mjs afterwards: the contrast gate is the arbiter.
 *
 * Merges into tokens/primitive.tokens.json (refuses if absent — pass --init to
 * create a colour-only file; the /tokens wizard copies the full template set).
 *
 * Dependency-free Node ESM. The OKLCH math and step recipes are shared with
 * adopt/infer-tokens.mjs by deliberate duplication — each template must run
 * standalone when copied into a project on its own.
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const PRIMITIVE = join(HERE, 'primitive.tokens.json');

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

const USAGE = `Usage: node tokens/generate-ramps.mjs --accent <#hex> [--neutral-hue <deg>]
         [--success <#hex|deg>] [--warning <#hex|deg>] [--danger <#hex|deg>]
         [--dry-run] [--init]

Defaults: success hue 150, warning 80, danger 25, neutral = accent hue at chroma 0.01.`;

const args = { success: '150', warning: '80', danger: '25', dryRun: false, init: false };
{
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--dry-run') args.dryRun = true;
    else if (a === '--init') args.init = true;
    else if (a === '--help' || a === '-h') { console.log(USAGE); process.exit(0); }
    else if (/^--(accent|neutral-hue|success|warning|danger)$/.test(a)) {
      const v = argv[++i];
      if (!v || v.startsWith('--')) die(`${a} needs a value\n\n${USAGE}`);
      args[a.slice(2).replace('-hue', 'Hue')] = v;
    } else die(`Unknown argument: ${a}\n\n${USAGE}`);
  }
  if (!args.accent) die(`--accent is required\n\n${USAGE}`);
}

function die(msg) { console.error(`\n✗ generate-ramps failed\n  ${msg}\n`); process.exit(1); }

// ---------------------------------------------------------------------------
// sRGB ⇄ OKLCH (same formulas as tokens/build.mjs and adopt/infer-tokens.mjs)
// ---------------------------------------------------------------------------

const srgbToLinear = (v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
const linearToSrgb = (v) => (v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055);

function rgbToOklch([r, g, b]) {
  const [lr, lg, lb] = [r, g, b].map(srgbToLinear);
  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb);
  const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb);
  const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb);
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  return { L, C: Math.hypot(A, B), H: ((Math.atan2(B, A) * 180) / Math.PI + 360) % 360 };
}

function oklchToLinear({ L, C, H }) {
  const A = C * Math.cos((H * Math.PI) / 180);
  const B = C * Math.sin((H * Math.PI) / 180);
  const l = (L + 0.3963377774 * A + 0.2158037573 * B) ** 3;
  const m = (L - 0.1055613458 * A - 0.0638541728 * B) ** 3;
  const s = (L - 0.0894841775 * A - 1.291485548 * B) ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
}

const inGamut = (c) => oklchToLinear(c).every((v) => v >= -1e-6 && v <= 1 + 1e-6);
function clampChroma(c) {
  let { L, C, H } = c;
  while (C > 0 && !inGamut({ L, C, H })) C -= 0.002;
  return { L, C: Math.max(0, C), H };
}

function parseHex(s) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(s).trim());
  if (!m) return null;
  return rgbToOklch(m[1].match(/../g).map((h) => parseInt(h, 16) / 255));
}

const fmtOklch = ({ L, C, H }) =>
  `oklch(${+(L * 100).toFixed(2)}% ${+C.toFixed(4)} ${+H.toFixed(3)})`;

// WCAG relative luminance + ratio, measured on the gamut-clamped sRGB result
function luminance(c) {
  const [r, g, b] = oklchToLinear(clampChroma(c)).map((v) => Math.min(1, Math.max(0, v)));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function ratio(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}
const WHITE = { L: 1, C: 0, H: 0 };

// ---------------------------------------------------------------------------
// Step recipes (scales.md chromatic table; shipped-neutral L column — see
// adopt/infer-tokens.mjs for the same tables and the rationale)
// ---------------------------------------------------------------------------

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

/**
 * Build one ramp. If `anchor` (an OKLCH from a user hex) is given, the exact
 * input value is placed at the step whose recipe L is nearest — the brand
 * colour appears verbatim in the palette — and hue/peak derive from it.
 */
function buildRamp(role, { anchor, hue }) {
  const recipe = role === 'neutral' ? NEUTRAL_RECIPE : STEP_RECIPE;
  const H = anchor ? anchor.H : hue;
  const peak = role === 'neutral'
    ? 0.01
    : Math.min(0.22, Math.max(0.12, anchor ? anchor.C : 0.185));

  let anchorStep = null;
  if (anchor && role !== 'neutral') {
    let bestD = Infinity;
    for (const [step, L] of recipe) {
      const d = Math.abs(L - anchor.L);
      if (d < bestD) { bestD = d; anchorStep = step; }
    }
  }

  const ramp = {};
  for (const [step, L, cf] of recipe) {
    if (step === anchorStep) {
      ramp[step] = { $value: fmtOklch(anchor), $description: `The brand colour, verbatim (its L ${+anchor.L.toFixed(3)} makes it the ${step} step).`, _oklch: anchor };
    } else {
      const c = clampChroma({ L, C: peak * cf, H });
      ramp[step] = { $value: fmtOklch(c), _oklch: c };
    }
  }
  return { ramp, anchorStep, H: +H.toFixed(3) };
}

function parseRoleArg(role, raw) {
  const asHex = parseHex(raw);
  if (asHex) return { anchor: asHex };
  const asHue = parseFloat(raw);
  if (!Number.isNaN(asHue) && asHue >= 0 && asHue < 360) return { hue: asHue };
  die(`--${role} must be a 6-digit hex or a hue in [0, 360): got "${raw}"`);
}

// ---------------------------------------------------------------------------
// Compact printer (same one-token-per-line form as import-palette.mjs)
// ---------------------------------------------------------------------------

function inline(v) {
  if (Array.isArray(v)) return `[${v.map(inline).join(', ')}]`;
  if (v && typeof v === 'object')
    return `{ ${Object.entries(v).map(([k, x]) => `${JSON.stringify(k)}: ${inline(x)}`).join(', ')} }`;
  return JSON.stringify(v);
}
function fmt(node, ind = '') {
  if (node === null || typeof node !== 'object' || Array.isArray(node)) return inline(node);
  if ('$value' in node) return inline(node);
  const entries = Object.entries(node).map(([k, v]) => `${ind}  ${JSON.stringify(k)}: ${fmt(v, ind + '  ')}`);
  return `{\n${entries.join(',\n')}\n${ind}}`;
}

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------

function main() {
  const accent = parseHex(args.accent);
  if (!accent) die(`--accent must be a 6-digit hex: got "${args.accent}"`);

  const spec = {
    accent: { anchor: accent },
    neutral: { hue: args.neutralHue !== undefined ? parseFloat(args.neutralHue) : accent.H },
    success: parseRoleArg('success', args.success),
    warning: parseRoleArg('warning', args.warning),
    danger: parseRoleArg('danger', args.danger),
  };
  if (Number.isNaN(spec.neutral.hue)) die(`--neutral-hue must be a number: got "${args.neutralHue}"`);

  const summary = [];
  const findings = [];
  const ramps = {};

  for (const role of ['neutral', 'accent', 'success', 'warning', 'danger']) {
    const { ramp, anchorStep, H } = buildRamp(role, spec[role]);

    // Measure the text-carrying steps (scales.md: verify contrast, never assume).
    if (role !== 'neutral') {
      const r600 = ratio(ramp['600']._oklch, WHITE);
      const r700 = ratio(ramp['700']._oklch, WHITE);
      const r900 = ratio(ramp['900']._oklch, WHITE);
      let fill = '600';
      if (r600 < 4.5) {
        fill = r700 >= 4.5 ? '700' : '800';
        const rFill = fill === '700' ? r700 : ratio(ramp['800']._oklch, WHITE);
        findings.push(`${role}: white on 600 measures ${r600.toFixed(2)}:1 — a light-peaking hue. The solid fill for this ramp is step ${fill} (${rFill.toFixed(2)}:1). Point color.bg.${role === 'accent' ? 'accent' : role} at {color.${role}.${fill}}; do not darken the ramp to force 600.`);
        ramp[fill].$description = `${ramp[fill].$description ? ramp[fill].$description + ' ' : ''}Solid-fill step for this hue: white text measures ${(fill === '700' ? r700 : ratio(ramp['800']._oklch, WHITE)).toFixed(2)}:1 (600 only reaches ${r600.toFixed(2)}:1).`;
      }
      ramp['600'].$description = ramp['600'].$description ??
        `Solid fill${fill === '600' ? '' : ' slot (but see step ' + fill + ' for this hue)'} — white text measures ${r600.toFixed(2)}:1.`;
      ramp['900'].$description = ramp['900'].$description ?? `Text on light backgrounds — ${r900.toFixed(2)}:1 vs white.`;
      summary.push(`  color.${role.padEnd(8)} hue ${String(H).padEnd(8)} fill=${fill}${anchorStep ? ` (brand hex verbatim at ${anchorStep})` : ''}`);
    } else {
      summary.push(`  color.${role.padEnd(8)} hue ${String(H).padEnd(8)} (tinted neutral, chroma 0.01)`);
    }

    for (const t of Object.values(ramp)) {
      delete t._oklch;
      t.$description = `${t.$description ? t.$description + ' ' : ''}Generated by tokens/generate-ramps.mjs from ${args.accent}; re-run to change, hand edits are overwritten.`;
    }
    ramps[role] = ramp;
  }

  let doc;
  if (existsSync(PRIMITIVE)) {
    doc = JSON.parse(readFileSync(PRIMITIVE, 'utf8'));
    if (!doc.color) doc.color = { $type: 'color' };
  } else if (args.init) {
    doc = { color: { $type: 'color' } };
  } else {
    die(`${PRIMITIVE} not found — the generator rewrites ramps inside the existing primitive file.\n  Copy the token templates first (the /design-system:tokens wizard does this), or pass --init for a colour-only file.`);
  }
  for (const [role, ramp] of Object.entries(ramps)) doc.color[role] = ramp;

  const out = fmt(doc) + '\n';
  JSON.parse(out); // never write a file the build cannot read

  if (args.dryRun) console.log('— dry run, nothing written —');
  else writeFileSync(PRIMITIVE, out);

  console.log(`✓ 5 ramps × 12 steps from ${args.accent} → tokens/primitive.tokens.json`);
  console.log(summary.join('\n'));
  for (const f of findings) console.log(`\n⚠ ${f}`);
  console.log('\nNow run: node tokens/build.mjs — the contrast gate is the arbiter.');
}

main();
