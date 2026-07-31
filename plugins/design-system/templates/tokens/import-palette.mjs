#!/usr/bin/env node
/**
 * Palette importer — source the primitive colour ramps from Tailwind or Radix Colors
 * instead of the generated OKLCH ramps.
 *
 * The one principle: NORMALIZE AT THE PRIMITIVE TIER. This script rewrites the five
 * colour ramps inside tokens/primitive.tokens.json (color.neutral / accent / success /
 * warning / danger) to the vendor's values, mapped onto the same 50–1000 steps the
 * generated ramps use. The semantic layer, the themes, and the contrast gate are not
 * touched — `{color.accent.600}` still means "the solid-fill step", it just resolves to
 * a Tailwind or Radix value now, and `node tokens/build.mjs` still gates every pair.
 *
 * If the build's contrast gate fails after an import, that is the gate WORKING: the
 * vendor step sitting in that slot does not carry the foreground the semantic layer
 * puts on it. The failure names the step to swap. Do not weaken the gate.
 *
 * Palette data is read from the LOCALLY INSTALLED package — nothing is vendored here,
 * so you get exactly the palette version your project depends on:
 *   tailwind → `tailwindcss` v4 ships the palette as CSS `@theme` in tailwindcss/theme.css
 *   radix    → `@radix-ui/colors` ships JS objects per scale (light + dark)
 *
 * Step mapping: tailwind chromatic ramps map ~1:1 (with 950/1000 handled specially),
 * the tailwind NEUTRAL ramp shifts its dark half one slot and interpolates 500/600,
 * and radix is role-mapped with the dark end taken from the *Dark scales. The full
 * rationale and both mapping tables live in the design-tokens skill's
 * references/scales.md ("Importing vendor palettes") — this file implements them.
 *
 * Usage:
 *   node tokens/import-palette.mjs --source tailwind --accent orange --neutral slate
 *   node tokens/import-palette.mjs --source radix --accent indigo --neutral slate \
 *        [--success green --warning amber --danger red] [--dry-run]
 *
 * Then: node tokens/build.mjs   (the contrast gate validates the imported palette)
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const HERE = dirname(fileURLToPath(import.meta.url));
const PRIMITIVE = join(HERE, 'primitive.tokens.json');
const OUR_STEPS = ['50', '100', '200', '300', '400', '500', '600', '700', '800', '900', '950', '1000'];
const RAMPS = ['neutral', 'accent', 'success', 'warning', 'danger'];

// Resolves from the PROJECT's node_modules (searching upward from tokens/), so a
// monorepo hoist works and the palette version is the one in the project's lockfile.
const req = createRequire(pathToFileURL(join(HERE, '__resolver__.js')));

function die(msg) {
  console.error(`\n✗ palette import failed\n  ${msg}\n`);
  process.exit(1);
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

const USAGE = `Usage: node tokens/import-palette.mjs --source tailwind|radix --accent <scale> --neutral <scale>
         [--success <scale>] [--warning <scale>] [--danger <scale>] [--dry-run]

Defaults: --success green --warning amber --danger red (both sources ship all three).`;

function parseArgs(argv) {
  const args = { success: 'green', warning: 'amber', danger: 'red', dryRun: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--dry-run') args.dryRun = true;
    else if (a === '--help' || a === '-h') { console.log(USAGE); process.exit(0); }
    else if (/^--(source|accent|neutral|success|warning|danger)$/.test(a)) {
      const key = a.slice(2);
      const v = argv[++i];
      if (!v || v.startsWith('--')) die(`${a} needs a value\n\n${USAGE}`);
      args[key] = v.toLowerCase();
    } else die(`Unknown argument: ${a}\n\n${USAGE}`);
  }
  if (args.source !== 'tailwind' && args.source !== 'radix')
    die(`--source must be tailwind or radix\n\n${USAGE}`);
  if (!args.accent || !args.neutral) die(`--accent and --neutral are required\n\n${USAGE}`);
  return args;
}

// ---------------------------------------------------------------------------
// OKLCH helpers (for the one interpolated Tailwind step)
// ---------------------------------------------------------------------------

function parseOklch(s) {
  const m = /^oklch\(([^)]+)\)$/.exec(String(s).trim());
  if (!m) return null;
  const parts = m[1].split('/')[0].trim().split(/\s+/);
  const L = parts[0].endsWith('%') ? parseFloat(parts[0]) / 100 : parseFloat(parts[0]);
  return { L, C: parseFloat(parts[1] ?? '0'), H: parseFloat(parts[2] ?? '0') };
}

/** Perceptual midpoint: linear in L and C, shortest arc in hue. */
function midOklch(a, b) {
  const d = ((b.H - a.H + 540) % 360) - 180;
  const H = (a.H + d / 2 + 360) % 360;
  return `oklch(${+(((a.L + b.L) / 2) * 100).toFixed(2)}% ${+((a.C + b.C) / 2).toFixed(4)} ${+H.toFixed(3)})`;
}

// ---------------------------------------------------------------------------
// Source: Tailwind v4 — palette parsed out of the package's theme.css
// ---------------------------------------------------------------------------

const TW_STEPS = ['50', '100', '200', '300', '400', '500', '600', '700', '800', '900', '950'];

function loadTailwind() {
  let pkgPath;
  try {
    pkgPath = req.resolve('tailwindcss/package.json');
  } catch {
    die(`tailwindcss is not installed in this project.\n  Run: npm install -D tailwindcss\n  (v4 ships the palette as CSS @theme in tailwindcss/theme.css — that file is what gets read)`);
  }
  const css = readFileSync(join(dirname(pkgPath), 'theme.css'), 'utf8');
  const scales = {};
  for (const m of css.matchAll(/--color-([a-z]+)-(\d+):\s*([^;]+);/g)) {
    (scales[m[1]] ??= {})[m[2]] = m[3].trim();
  }
  if (!Object.keys(scales).length)
    die(`No --color-<name>-<step> declarations found in tailwindcss/theme.css — is this Tailwind v4? (v3 keeps the palette in JS, not @theme)`);
  const version = JSON.parse(readFileSync(pkgPath, 'utf8')).version;

  return {
    label: `Tailwind CSS ${version}`,
    names: Object.keys(scales),
    ramp(scaleName, role) {
      const tw = scales[scaleName];
      if (!tw) die(`Tailwind has no "${scaleName}" scale. Available: ${Object.keys(scales).join(', ')}`);
      const missing = TW_STEPS.filter((s) => !tw[s]);
      if (missing.length) die(`Tailwind ${scaleName} is missing step(s) ${missing.join(', ')} — cannot map`);

      const mid = (lo, hi, why) => {
        const a = parseOklch(tw[lo]);
        const b = parseOklch(tw[hi]);
        if (!a || !b)
          die(`Tailwind ${scaleName} ${lo}/${hi} are not oklch() values (got "${tw[lo]}", "${tw[hi]}") — cannot interpolate`);
        return { $value: midOklch(a, b), $description: `OKLCH midpoint of Tailwind ${scaleName}-${lo}/${hi} (${why})` };
      };
      const ramp = {};

      if (role === 'neutral') {
        // Tailwind's neutral dark half runs one rung darker than the ramp recipe
        // (tw 700 L .372 ≈ recipe 800 .375; tw 900 .208 ≈ recipe 950 .205), so tw
        // 500–950 shift down one slot. Our 500/600 carry a dual text constraint —
        // fg.subtle ≥3:1 on near-white in light AND fg.muted ≥4.5:1 on near-black in
        // dark (and vice versa) — that lands BETWEEN Tailwind's rungs, so those two
        // steps are interpolated midpoints, never extrapolations.
        for (const s of ['50', '100', '200', '300', '400']) {
          ramp[s] = { $value: tw[s], $description: `Tailwind ${scaleName}-${s}` };
        }
        ramp['500'] = mid('400', '500', 'dual text constraint falls between Tailwind rungs');
        ramp['600'] = mid('500', '600', 'dual text constraint falls between Tailwind rungs');
        const shifted = { 700: '600', 800: '700', 900: '800', 950: '900', 1000: '950' };
        for (const [ours, twStep] of Object.entries(shifted)) {
          ramp[ours] = {
            $value: tw[twStep],
            $description: `Tailwind ${scaleName}-${twStep} (neutral dark half shifts one slot — Tailwind's runs a rung darker than the ramp recipe)`,
          };
        }
        return { ramp, note: `${scaleName} 50–950, dark half shifted, 500/600 interpolated` };
      }

      // Chromatic ramps: 50–900 map 1:1 — same nominal steps, same conventions
      // (tw <hue>-600 is the classic solid-button step, 50 the page tint).
      for (const s of TW_STEPS.slice(0, 10)) {
        ramp[s] = { $value: tw[s], $description: `Tailwind ${scaleName}-${s}` };
      }
      // Our 1000 ← tw 950: both are "the darkest step" whose job is dark-mode page
      // backgrounds (tw added 950 in v3.3 for exactly that). Our 950 (dark-theme
      // surface, between raised 900 and page 1000) has no Tailwind equivalent.
      ramp['950'] = mid('900', '950', 'our 950 = dark-theme surface; Tailwind has no step between');
      ramp['1000'] = { $value: tw['950'], $description: `Tailwind ${scaleName}-950 (darkest step — dark-mode page background)` };
      return { ramp, note: `${scaleName} 50–950 (+ interpolated 950)` };
    },
  };
}

// ---------------------------------------------------------------------------
// Source: Radix Colors — light + dark scales from the package's JS exports
// ---------------------------------------------------------------------------

/**
 * Role-mapped, per Radix's documented step semantics
 * (radix-ui.com/colors/docs/palette-composition/understanding-the-scale).
 * Our 50–600 take light-scale steps whose documented role matches the slot's job;
 * our 700–1000 take *Dark-scale* steps so the dark theme (which reads the ramp's dark
 * end for surfaces and interaction states) renders Radix's dark-appearance values.
 */
const RADIX_MAP = [
  // [our step, appearance, radix step, radix documented role]
  ['50', 'light', 1, 'app background'],
  ['100', 'light', 3, 'UI element background'],
  ['200', 'light', 4, 'hovered UI element background'],
  ['300', 'light', 5, 'active / selected UI element background'],
  ['400', 'light', 7, 'UI element border and focus rings'],
  ['500', 'light', 9, 'solid backgrounds'],
  ['600', 'light', 11, 'low-contrast text'],
  ['700', 'dark', 5, 'active / selected UI element background, dark'],
  ['800', 'dark', 4, 'hovered UI element background, dark'],
  ['900', 'dark', 3, 'UI element background, dark'],
  ['950', 'dark', 2, 'subtle background, dark'],
  ['1000', 'dark', 1, 'app background, dark'],
];

function loadRadix() {
  let scales;
  try {
    scales = req('@radix-ui/colors');
  } catch {
    die(`@radix-ui/colors is not installed in this project.\n  Run: npm install -D @radix-ui/colors`);
  }
  const names = Object.keys(scales).filter((k) => /^[a-z]+$/.test(k) && scales[`${k}Dark`]);
  const version = JSON.parse(readFileSync(req.resolve('@radix-ui/colors/package.json'), 'utf8')).version;

  return {
    label: `Radix Colors ${version}`,
    names,
    ramp(scaleName) {
      const light = scales[scaleName];
      const dark = scales[`${scaleName}Dark`];
      if (!light || !dark)
        die(`Radix has no "${scaleName}" light+dark scale pair. Available: ${names.join(', ')}`);
      const ramp = {};
      for (const [ours, appearance, step, role] of RADIX_MAP) {
        const scale = appearance === 'dark' ? dark : light;
        const value = scale[`${scaleName}${step}`];
        if (!value) die(`Radix ${scaleName}${appearance === 'dark' ? 'Dark' : ''} is missing step ${step}`);
        ramp[ours] = {
          $value: value,
          $description: `Radix ${scaleName}${appearance === 'dark' ? 'Dark' : ''} ${step} — ${role}`,
        };
      }
      return { ramp, note: `${scaleName} light 1–11 + ${scaleName}Dark 1–5` };
    },
  };
}

// ---------------------------------------------------------------------------
// Write primitive.tokens.json (compact printer: one token per line, like the original)
// ---------------------------------------------------------------------------

function inline(v) {
  if (Array.isArray(v)) return `[${v.map(inline).join(', ')}]`;
  if (v && typeof v === 'object')
    return `{ ${Object.entries(v).map(([k, x]) => `${JSON.stringify(k)}: ${inline(x)}`).join(', ')} }`;
  return JSON.stringify(v);
}

function fmt(node, ind = '') {
  if (node === null || typeof node !== 'object' || Array.isArray(node)) return inline(node);
  if ('$value' in node) return inline(node); // token leaf: one line
  const entries = Object.entries(node).map(([k, v]) => `${ind}  ${JSON.stringify(k)}: ${fmt(v, ind + '  ')}`);
  return `{\n${entries.join(',\n')}\n${ind}}`;
}

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!existsSync(PRIMITIVE))
    die(`${PRIMITIVE} not found — the importer rewrites the ramps inside the existing primitive file, it does not create one`);

  const source = args.source === 'tailwind' ? loadTailwind() : loadRadix();

  const doc = JSON.parse(readFileSync(PRIMITIVE, 'utf8'));
  if (!doc.color) die(`primitive.tokens.json has no "color" group`);

  const summary = [];
  for (const role of RAMPS) {
    const scaleName = args[role];
    const { ramp, note } = source.ramp(scaleName, role);
    const existing = doc.color[role];
    if (!existing) console.warn(`⚠ color.${role} did not exist in primitive.tokens.json — adding it`);
    doc.color[role] = {
      $description: `Imported from ${source.label} (${note}) by tokens/import-palette.mjs — re-run the importer to change; hand edits to this ramp are overwritten on re-import.`,
      ...ramp,
    };
    summary.push(`  color.${role.padEnd(8)} ← ${source.label.split(' ')[0].toLowerCase()} ${note}`);
  }

  const out = fmt(doc) + '\n';
  JSON.parse(out); // self-check: never write a file the build cannot read

  if (args.dryRun) {
    console.log(`— dry run, nothing written —`);
  } else {
    writeFileSync(PRIMITIVE, out);
  }

  console.log(`✓ ${source.label} → ${OUR_STEPS.length}-step ramps in tokens/primitive.tokens.json`);
  console.log(summary.join('\n'));
  console.log(`\nNow run: node tokens/build.mjs`);
  console.log(`The contrast gate validates the imported palette — a failing pair means the vendor`);
  console.log(`step in that slot cannot carry its foreground; the error names the step to swap.`);
}

main();
