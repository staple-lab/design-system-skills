#!/usr/bin/env node
/**
 * Repo self-check for the design-system plugin. Dependency-free Node ESM.
 *
 * Checks, in order:
 *   1. Frontmatter — every SKILL.md `name` matches its directory and has a
 *      `description`; every agent `name` matches its filename; every command
 *      has a `description`.
 *   2. Manifests — plugin.json and marketplace.json parse, versions are
 *      semver-shaped, the marketplace `source` resolves.
 *   3. Paths — every `${CLAUDE_PLUGIN_ROOT}/...` reference in a skill, command
 *      or agent resolves to a real file; every `references/<file>.md` a
 *      SKILL.md mentions exists; and the inverse: every file under a skill's
 *      references/ is mentioned somewhere in the plugin (the orphaned-file
 *      class of bug fails silently at use time, which is the worst time).
 *   4. Template smoke runs — in a scratch dir under os.tmpdir(), never inside
 *      templates/: token build across all five CSS systems, the NEGATIVE
 *      contrast case (a broken fg/bg pair must exit non-zero), --check
 *      staleness, registry build + --check, and the palette importer's
 *      no-package failure mode.
 *   5. TSX parse gate — tsc --noEmit --noResolve over templates/**\/*.tsx,
 *      ignoring the three sanctioned error classes (absent dependencies).
 *      Warn-skips when tsc is not on PATH.
 *
 * Usage: node scripts/check-plugin.mjs
 * Exits non-zero if any check fails.
 */

import { readFileSync, readdirSync, statSync, existsSync, mkdtempSync, mkdirSync, rmSync, cpSync, writeFileSync } from 'node:fs';
import { join, dirname, basename, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const DS = join(ROOT, 'plugins', 'design-system');
const TEMPLATES = join(DS, 'templates');

let failures = 0;
let checks = 0;
const fail = (msg) => { failures++; console.error(`  ✗ ${msg}`); };
const ok = (msg) => { checks++; console.log(`  ✓ ${msg}`); };
const warn = (msg) => console.warn(`  ! ${msg}`);
const section = (t) => console.log(`\n${t}`);

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) yield* walk(p);
    else yield p;
  }
}

function frontmatter(file) {
  const text = readFileSync(file, 'utf8');
  const m = /^---\n([\s\S]*?)\n---/.exec(text);
  if (!m) return null;
  const out = {};
  for (const line of m[1].split('\n')) {
    const kv = /^([A-Za-z-]+):\s*(.*)$/.exec(line);
    if (kv) out[kv[1]] = kv[2].replace(/^["']|["']$/g, '');
  }
  return out;
}

// ---------------------------------------------------------------------------
// 1. Frontmatter
// ---------------------------------------------------------------------------
section('Frontmatter');
{
  const skillsDir = join(DS, 'skills');
  for (const dir of readdirSync(skillsDir)) {
    const skillFile = join(skillsDir, dir, 'SKILL.md');
    if (!existsSync(skillFile)) { fail(`skills/${dir} has no SKILL.md`); continue; }
    const fm = frontmatter(skillFile);
    if (!fm) fail(`skills/${dir}/SKILL.md has no frontmatter`);
    else {
      if (fm.name !== dir) fail(`skills/${dir}: frontmatter name "${fm.name}" ≠ directory name`);
      if (!fm.description) fail(`skills/${dir}: missing description`);
    }
  }
  ok(`${readdirSync(skillsDir).length} skills have matching name + description`);

  for (const file of readdirSync(join(DS, 'agents'))) {
    const fm = frontmatter(join(DS, 'agents', file));
    const stem = basename(file, '.md');
    if (!fm) fail(`agents/${file}: no frontmatter`);
    else {
      if (fm.name !== stem) fail(`agents/${file}: frontmatter name "${fm.name}" ≠ filename`);
      if (!fm.description) fail(`agents/${file}: missing description`);
    }
  }
  ok('agents have matching name + description');

  for (const file of readdirSync(join(DS, 'commands'))) {
    const fm = frontmatter(join(DS, 'commands', file));
    if (!fm || !fm.description) fail(`commands/${file}: missing description`);
  }
  ok('commands have descriptions');
}

// ---------------------------------------------------------------------------
// 2. Manifests
// ---------------------------------------------------------------------------
section('Manifests');
{
  const semver = /^\d+\.\d+\.\d+$/;
  let plugin;
  try {
    plugin = JSON.parse(readFileSync(join(DS, '.claude-plugin', 'plugin.json'), 'utf8'));
    if (!semver.test(plugin.version)) fail(`plugin.json version "${plugin.version}" is not semver`);
    ok(`plugin.json parses (v${plugin.version})`);
  } catch (e) { fail(`plugin.json: ${e.message}`); }

  try {
    const mkt = JSON.parse(readFileSync(join(ROOT, '.claude-plugin', 'marketplace.json'), 'utf8'));
    for (const p of mkt.plugins ?? []) {
      const src = typeof p.source === 'string' ? p.source : p.source?.source;
      if (src && !existsSync(join(ROOT, src))) fail(`marketplace.json: source "${src}" does not resolve`);
    }
    ok('marketplace.json parses and sources resolve');
  } catch (e) { fail(`marketplace.json: ${e.message}`); }
}

// ---------------------------------------------------------------------------
// 3. Path references
// ---------------------------------------------------------------------------
section('Path references');
{
  const mdFiles = [];
  for (const sub of ['skills', 'commands', 'agents']) {
    for (const f of walk(join(DS, sub))) if (f.endsWith('.md')) mdFiles.push(f);
  }

  let rootRefs = 0;
  for (const file of mdFiles) {
    const text = readFileSync(file, 'utf8');
    for (const m of text.matchAll(/\$\{CLAUDE_PLUGIN_ROOT\}\/([A-Za-z0-9_\-./]+[A-Za-z0-9_\-])/g)) {
      rootRefs++;
      if (!existsSync(join(DS, m[1])))
        fail(`${relative(ROOT, file)}: dangling \${CLAUDE_PLUGIN_ROOT}/${m[1]}`);
    }
    // Bare references/<file>.md mentions must exist relative to the skill dir.
    // A preceding path segment (e.g. other-skill/references/x.md) is a
    // cross-skill path, checked by the ${CLAUDE_PLUGIN_ROOT} rule instead.
    if (basename(file) === 'SKILL.md') {
      for (const m of text.matchAll(/(?<![\w/])references\/([A-Za-z0-9_\-./]+\.md)/g)) {
        if (!existsSync(join(dirname(file), 'references', m[1])))
          fail(`${relative(ROOT, file)}: mentions missing references/${m[1]}`);
      }
      // Cross-skill mentions written as <skill>/references/<file>.md
      for (const m of text.matchAll(/(?<![\w/-])([a-z0-9-]+)\/references\/([A-Za-z0-9_\-./]+\.md)/g)) {
        if (m[1] === 'skills') continue; // part of a longer ${CLAUDE_PLUGIN_ROOT} path, checked above
        if (!existsSync(join(DS, 'skills', m[1], 'references', m[2])))
          fail(`${relative(ROOT, file)}: mentions missing ${m[1]}/references/${m[2]}`);
      }
    }
    // Bare recipes/<file>.md mentions (the roadmap's links) resolve against the
    // architect skill's recipes dir, or relative to the mentioning file.
    for (const m of text.matchAll(/(?<![\w/-])recipes\/([a-z0-9./-]+\.md)/g)) {
      if (!existsSync(join(dirname(file), 'recipes', m[1])) &&
          !existsSync(join(DS, 'skills', 'design-system-architect', 'references', 'recipes', m[1])))
        fail(`${relative(ROOT, file)}: mentions missing recipes/${m[1]}`);
    }
  }
  ok(`${rootRefs} \${CLAUDE_PLUGIN_ROOT} references resolve`);

  // Inverse: every file under a skill's references/ is mentioned somewhere
  const corpus = mdFiles.map((f) => readFileSync(f, 'utf8')).join('\n');
  let refFiles = 0;
  for (const dir of readdirSync(join(DS, 'skills'))) {
    const refDir = join(DS, 'skills', dir, 'references');
    if (!existsSync(refDir)) continue;
    for (const f of walk(refDir)) {
      refFiles++;
      if (!corpus.includes(basename(f)))
        fail(`skills/${dir}/references/${basename(f)} is referenced by nothing — orphaned`);
    }
  }
  ok(`${refFiles} reference files are all mentioned somewhere`);
}

// ---------------------------------------------------------------------------
// 4. Template smoke runs (scratch dir — never inside templates/)
// ---------------------------------------------------------------------------
section('Template smoke runs');
{
  const scratch = mkdtempSync(join(tmpdir(), 'ds-check-'));
  const run = (args, opts = {}) =>
    spawnSync(process.execPath, args, { cwd: scratch, encoding: 'utf8', ...opts });
  try {
    cpSync(TEMPLATES, scratch, { recursive: true });

    for (const s of ['css-modules', 'tailwind', 'vanilla-extract', 'stylex', 'panda']) {
      writeFileSync(join(scratch, 'design-system.config.json'),
        JSON.stringify({ stack: { cssSystem: s }, paths: { components: 'components' } }));
      const r = run(['tokens/build.mjs']);
      if (r.status !== 0) fail(`token build failed for ${s}:\n${r.stderr || r.stdout}`);
    }
    ok('token build green across all five CSS systems');

    const r1 = run(['tokens/build.mjs', '--check']);
    if (r1.status !== 0) fail(`build.mjs --check reports stale right after a build:\n${r1.stderr || r1.stdout}`);
    else ok('build.mjs --check clean after build');

    // Negative contrast case: the gate must FAIL on a broken pair
    const semPath = join(scratch, 'tokens', 'semantic.light.tokens.json');
    const sem = readFileSync(semPath, 'utf8');
    const broken = JSON.parse(sem);
    broken.color.fg['on-accent'].$value = '{color.neutral.500}';
    writeFileSync(semPath, JSON.stringify(broken));
    const r2 = run(['tokens/build.mjs']);
    if (r2.status === 0) fail('contrast gate PASSED a broken fg.on-accent pair — the gate is not gating');
    else ok('contrast gate exits non-zero on a broken pair');
    writeFileSync(semPath, sem);
    const r3 = run(['tokens/build.mjs']);
    if (r3.status !== 0) fail('build not green after restoring the broken pair');

    const r4 = run(['registry/build-registry.mjs']);
    const r5 = run(['registry/build-registry.mjs', '--check']);
    if (r4.status !== 0 || r5.status !== 0)
      fail(`registry build/--check failed:\n${(r4.stderr || '') + (r5.stderr || '')}`);
    else {
      ok('registry build + --check green against the scratch project');
      // The registry must extract the compound/complex templates, not just Button —
      // Select is the canary for compound-part + popup component extraction.
      try {
        const reg = JSON.parse(readFileSync(join(scratch, '.design-system', 'registry.json'), 'utf8'));
        const names = (reg.components ?? []).map((c) => c.name);
        for (const expected of ['Button', 'Select', 'Table', 'Toast']) {
          if (!names.includes(expected)) fail(`registry did not extract ${expected} (got: ${names.join(', ')})`);
        }
        if (names.includes('Select')) ok('registry extracts the compound templates (Select/Table/Toast)');
      } catch (e) { fail(`could not read scratch registry.json: ${e.message}`); }
    }

    // Ramp generator: deterministic, gate-passing on a mid-hue brand, and the
    // light-peaking finding + documented re-point path must work end to end.
    {
      const orig = readFileSync(join(scratch, 'tokens', 'primitive.tokens.json'), 'utf8');
      const g1 = run(['tokens/generate-ramps.mjs', '--accent', '#7C3AED']);
      const purple1 = readFileSync(join(scratch, 'tokens', 'primitive.tokens.json'), 'utf8');
      writeFileSync(join(scratch, 'tokens', 'primitive.tokens.json'), orig);
      run(['tokens/generate-ramps.mjs', '--accent', '#7C3AED']);
      const purple2 = readFileSync(join(scratch, 'tokens', 'primitive.tokens.json'), 'utf8');
      const gBuild = run(['tokens/build.mjs']);
      if (g1.status !== 0) fail(`generate-ramps.mjs failed:\n${g1.stderr || g1.stdout}`);
      else if (purple1 !== purple2) fail('generate-ramps.mjs is not deterministic — same hex produced different files');
      else if (!/verbatim at 600/.test(g1.stdout)) fail('brand hex #7C3AED did not land verbatim at step 600');
      else if (gBuild.status !== 0) fail(`contrast gate rejected generated purple ramps:\n${gBuild.stderr || gBuild.stdout}`);
      else ok('generate-ramps: deterministic, brand hex verbatim, gate passes');

      writeFileSync(join(scratch, 'tokens', 'primitive.tokens.json'), orig);
      const g2 = run(['tokens/generate-ramps.mjs', '--accent', '#16A34A']);
      const gFail = run(['tokens/build.mjs']);
      if (!/accent: white on 600 .* light-peaking/.test(g2.stdout)) fail('green accent did not produce the light-peaking finding');
      else if (gFail.status === 0) fail('gate passed a light-peaking accent at 600 — it should fail until the semantic re-point');
      else {
        // The documented fix: re-point bg.accent (and its states) one step darker.
        for (const f of ['semantic.light.tokens.json', 'semantic.dark.tokens.json']) {
          const p = join(scratch, 'tokens', f);
          writeFileSync(p, readFileSync(p, 'utf8').replaceAll('{color.accent.600}', '{color.accent.700}'));
        }
        const gFixed = run(['tokens/build.mjs']);
        if (gFixed.status !== 0) fail(`gate still fails after the documented re-point:\n${gFixed.stderr || gFixed.stdout}`);
        else ok('generate-ramps: light-peaking finding printed, documented re-point clears the gate');
      }
      // restore pristine sources for the checks that follow
      cpSync(join(TEMPLATES, 'tokens'), join(scratch, 'tokens'), { recursive: true });
      run(['tokens/build.mjs']);
    }

    // Adopt inference: deterministic clustering over the committed fixture, and
    // the inferred ramps must clear the contrast gate end to end.
    {
      const proj = join(scratch, 'adopt-proj');
      mkdirSync(join(proj, 'src'), { recursive: true });
      cpSync(join(scratch, 'adopt', 'fixtures'), join(proj, 'src'), { recursive: true });
      cpSync(join(scratch, 'tokens'), join(proj, 'tokens'), { recursive: true });
      writeFileSync(join(proj, 'design-system.config.json'),
        JSON.stringify({ stack: { cssSystem: 'css-modules' }, tokens: { prefix: 'ds' } }));
      const r7 = spawnSync(process.execPath, [join(scratch, 'adopt', 'infer-tokens.mjs'), '--dir', proj, '--write'],
        { cwd: proj, encoding: 'utf8' });
      if (r7.status !== 0) fail(`infer-tokens.mjs failed on the fixture:\n${r7.stderr || r7.stdout}`);
      else {
        try {
          const vm = JSON.parse(readFileSync(join(proj, '.design-system', 'adopt', 'value-map.json'), 'utf8'));
          const byLit = new Map(vm.entries.map((e) => [`${e.kind}:${e.literal}`, e]));
          const expect = [
            ['color:#2563eb', 'color.accent.600', 'exact'],
            ['color:#16a34a', 'color.success.600', null],
            ['dimension:16px', 'space.4', 'exact'],
            ['dimension:17px', 'space.4', 'snap'],
            ['z-index:9999', null, null], // present, token is judgement
          ];
          for (const [key, token, conf] of expect) {
            const e = byLit.get(key);
            if (!e) fail(`value-map missing ${key}`);
            else {
              if (token && e.token !== token) fail(`value-map ${key} → ${e.token}, expected ${token}`);
              if (conf && e.confidence !== conf) fail(`value-map ${key} confidence ${e.confidence}, expected ${conf}`);
            }
          }
          const r8 = spawnSync(process.execPath, ['tokens/build.mjs'], { cwd: proj, encoding: 'utf8' });
          if (r8.status !== 0) fail(`contrast gate rejected the fixture-inferred ramps:\n${r8.stderr || r8.stdout}`);
          else ok('adopt inference: deterministic value map, inferred ramps clear the gate');
        } catch (e) { fail(`adopt smoke: ${e.message}`); }
      }
    }

    // Figma bridge: fixture → DTCG → token build (gate included) → clean --diff,
    // and Code Connect generation from the scratch registry.
    {
      const proj = join(scratch, 'figma-proj');
      mkdirSync(join(proj, 'tokens'), { recursive: true });
      cpSync(join(scratch, 'tokens', 'build.mjs'), join(proj, 'tokens', 'build.mjs'));
      writeFileSync(join(proj, 'design-system.config.json'),
        JSON.stringify({ stack: { cssSystem: 'css-modules' }, tokens: { prefix: 'ds' } }));
      const fixture = join(scratch, 'figma', 'fixtures', 'variables.example.json');
      const conv = join(scratch, 'figma', 'variables-to-dtcg.mjs');
      const r9 = spawnSync(process.execPath, [conv, fixture, '--out', 'tokens'], { cwd: proj, encoding: 'utf8' });
      const r10 = spawnSync(process.execPath, ['tokens/build.mjs'], { cwd: proj, encoding: 'utf8' });
      const r11 = spawnSync(process.execPath, [conv, fixture, '--out', 'tokens', '--diff'], { cwd: proj, encoding: 'utf8' });
      if (r9.status !== 0) fail(`variables-to-dtcg.mjs failed on the fixture:\n${r9.stderr || r9.stdout}`);
      else if (r10.status !== 0) fail(`token build rejected the converted fixture:\n${r10.stderr || r10.stdout}`);
      else if (r11.status !== 0) fail(`--diff reports drift right after its own conversion:\n${r11.stdout}`);
      else ok('figma fixture round-trip: convert → build + gate → clean --diff');

      const r12 = spawnSync(process.execPath, [join(scratch, 'figma', 'registry-to-codeconnect.mjs')],
        { cwd: scratch, encoding: 'utf8' });
      if (r12.status !== 0) fail(`registry-to-codeconnect.mjs failed:\n${r12.stderr || r12.stdout}`);
      else if (!existsSync(join(scratch, 'figma', 'connect', 'Select.figma.tsx')))
        fail('registry-to-codeconnect.mjs did not emit Select.figma.tsx');
      else ok('Code Connect files generate from the registry');
    }

    // Importer failure mode: without tailwindcss installed it must die with instructions.
    // (The positive path needs the package installed — CI covers it.)
    const r6 = run(['tokens/import-palette.mjs', '--source', 'tailwind', '--accent', 'orange', '--neutral', 'slate']);
    if (r6.status === 0) fail('import-palette.mjs succeeded without tailwindcss installed');
    else if (!/tailwindcss is not installed/.test(r6.stderr)) fail(`import-palette.mjs failed without naming the fix:\n${r6.stderr}`);
    else ok('import-palette.mjs fails helpfully when the source package is absent');
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}

// ---------------------------------------------------------------------------
// 5. TSX parse gate
// ---------------------------------------------------------------------------
section('TSX parse gate');
{
  const tsx = [...walk(TEMPLATES)].filter((f) => f.endsWith('.tsx'));
  const tsc = spawnSync('tsc', ['--version'], { encoding: 'utf8' }).status === 0 ? 'tsc'
    : spawnSync('npx', ['--no-install', 'tsc', '--version'], { encoding: 'utf8' }).status === 0 ? 'npx'
    : null;
  if (!tsc) {
    warn(`no tsc on PATH — skipping parse gate over ${tsx.length} .tsx files`);
  } else {
    const cmd = tsc === 'npx' ? ['npx', ['--no-install', 'tsc']] : ['tsc', []];
    // --noCheck: the bar is "templates must PARSE" (CLAUDE.md). With
    // --noResolve every import is untyped, so type diagnostics are pure noise
    // that shifts with the tsc version (tsc 7 types JSON.parse as unknown,
    // defaults strict on, …). Syntax errors still surface under --noCheck.
    const r = spawnSync(cmd[0], [...cmd[1], '--noEmit', '--noCheck', '--noResolve', '--jsx', 'react-jsx',
      '--target', 'es2022', '--skipLibCheck', ...tsx], { encoding: 'utf8' });
    // Sanctioned error classes: consequences of absent dependencies (no
    // node_modules here), not defects. TS2503/TS7026 are what --noResolve
    // produces when @types/react is absent.
    const real = (r.stdout || '').split('\n').filter((l) =>
      /error TS/.test(l) &&
      !/Cannot find module/.test(l) &&
      !/jsx-runtime/.test(l) &&
      !/import\.meta/.test(l) &&
      !/Cannot find namespace 'React'/.test(l) &&
      !/JSX element implicitly has type 'any'/.test(l));
    if (real.length) { for (const l of real) fail(l); }
    else ok(`${tsx.length} .tsx templates parse (absent-dependency errors ignored)`);
  }
}

// ---------------------------------------------------------------------------
console.log(failures
  ? `\n✗ ${failures} failure(s), ${checks} check group(s) passed`
  : `\n✓ all checks green (${checks} check groups)`);
process.exit(failures ? 1 : 0);
