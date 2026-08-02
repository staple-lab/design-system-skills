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
 *   5. Workflow scripts — templates/workflows/*.mjs parse (once the export is
 *      stripped and the top-level return wrapped), meta is a pure literal,
 *      every phase() title matches a meta.phases entry, and none of the
 *      resume-breaking globals (Date.now, new Date, Math.random) appear.
 *   6. TSX parse gate — tsc --noEmit --noResolve over templates/**\/*.tsx,
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

    // Brand extraction: deterministic over the committed fixture, clusters
    // notations of one colour together, never proposes a neutral as the accent,
    // and REPORTS what it could not decode rather than silently dropping it.
    {
      const e1 = run(['tokens/extract-brand.mjs', '--dir', 'tokens/fixtures/brand', '--json']);
      const e2 = run(['tokens/extract-brand.mjs', '--dir', 'tokens/fixtures/brand', '--json']);
      if (e1.status !== 0) fail(`extract-brand.mjs failed on the fixture:\n${e1.stderr || e1.stdout}`);
      else if (e1.stdout !== e2.stdout) fail('extract-brand.mjs is not deterministic — same fixture produced different output');
      else {
        try {
          const r = JSON.parse(e1.stdout);
          if (r.suggested !== '#7c3aed') fail(`extract-brand suggested ${r.suggested}, expected #7c3aed`);
          const top = r.candidates[0];
          // #7C3AED, rgb(124,58,238), #7b39ec and the svg's uses are ONE colour.
          if (top.count !== 7) fail(`extract-brand clustered the accent into ${top.count} hits, expected 7`);
          if (!top.solidFillReady) fail('extract-brand called the violet accent light-peaking — it clears 4.5:1');
          if (!r.skipped.some((p) => p.endsWith('.png')))
            fail('extract-brand did not report the undecodable .png — a silent skip is the bug this guards');
          if (r.candidates.some((c) => c.chroma < 0.03))
            fail('extract-brand proposed a neutral as a brand candidate');
          if (!r.neutrals.some((n) => n.hex === '#ffffff'))
            fail('extract-brand did not report white among the neutrals');
          ok('extract-brand: deterministic, clusters notations, reports undecodable sources');
        } catch (e) { fail(`extract-brand JSON: ${e.message}`); }
      }

      // Negative case: nothing to find must exit non-zero with a hint.
      mkdirSync(join(scratch, 'empty-brand'), { recursive: true });
      writeFileSync(join(scratch, 'empty-brand', 'notes.md'), '# no colours here\n');
      const e3 = run(['tokens/extract-brand.mjs', '--dir', 'empty-brand']);
      if (e3.status === 0) fail('extract-brand exited 0 with no colours found — it must fail, not report an empty brand');
      else ok('extract-brand exits non-zero when there is nothing to extract');

      // The whole point: extracted hex → ramps → the contrast gate.
      const e4 = run(['tokens/generate-ramps.mjs', '--accent', '#7c3aed']);
      const e5 = run(['tokens/build.mjs']);
      if (e4.status !== 0 || e5.status !== 0)
        fail(`extracted accent did not survive ramps+gate:\n${e4.stderr || e5.stderr}`);
      else ok('extract-brand → generate-ramps → contrast gate green end to end');
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
// 4b. Live examples contract
//
// The inventory renders a component only when a `<Name>.examples.tsx` sits beside
// it, exporting one component per meta example named `title` with non-alphanumerics
// stripped. That contract lives in FOUR places — the inventory's glob, the page's
// export-name derivation, the author agent's instructions, and the Button template —
// and when they drift the failure is silent: nothing errors, the docs just quietly
// stop showing components. Which is exactly how it shipped broken once.
// ---------------------------------------------------------------------------
section('Live examples contract');
{
  const dataTs = readFileSync(join(TEMPLATES, 'inventory', 'src', 'data.ts'), 'utf8');
  const pageTsx = readFileSync(join(TEMPLATES, 'inventory', 'src', 'ComponentPage.tsx'), 'utf8');
  const authorMd = readFileSync(join(DS, 'agents', 'ds-component-author.md'), 'utf8');

  const glob = /import\.meta\.glob\(\s*['"]([^'"]+)['"]/.exec(dataTs);
  if (!glob) fail('inventory/src/data.ts no longer globs example modules');
  else if (!/\*\.examples\.tsx$/.test(glob[1]))
    fail(`inventory glob "${glob[1]}" does not end in *.examples.tsx — the documented filename`);
  else ok(`inventory globs ${glob[1]}`);

  // The page derives the export name by stripping non-alphanumerics from the title.
  if (!/replace\(\/\[\^A-Za-z0-9\]\/g,\s*''\)/.test(pageTsx))
    fail('ComponentPage.tsx no longer derives the export name by stripping non-alphanumerics — update the agent instructions to match');
  else ok('ComponentPage derives export names by stripping non-alphanumerics');

  // The author must be TOLD to write the file, or nothing ever creates one.
  for (const [needle, why] of [
    ['.examples.tsx', 'the filename'],
    ['non-alphanumeric', 'the export-name rule'],
  ]) {
    if (!authorMd.includes(needle))
      fail(`ds-component-author.md does not mention ${why} ("${needle}") — components will ship with dead previews`);
  }
  ok('ds-component-author is instructed to write the examples file');

  // The Button template must practise it, and its exports must match its own meta.
  const btnDir = join(TEMPLATES, 'components', 'Button');
  const exFile = join(btnDir, 'Button.examples.tsx');
  if (!existsSync(exFile)) fail('templates/components/Button has no Button.examples.tsx — the reference component must model the contract');
  else {
    const ex = readFileSync(exFile, 'utf8');
    const exports = new Set([...ex.matchAll(/export function ([A-Za-z0-9_]+)\s*\(/g)].map((m) => m[1]));
    const meta = JSON.parse(readFileSync(join(btnDir, 'Button.meta.json'), 'utf8'));
    const titles = (meta.examples ?? []).map((e) => e.title);
    if (!titles.length) fail('Button.meta.json has no examples to model');
    for (const t of titles) {
      const want = t.replace(/[^A-Za-z0-9]/g, '');
      if (!exports.has(want) && !exports.has(`Example${want}`))
        fail(`Button.examples.tsx has no export for meta example "${t}" (expected ${want}) — a silently dead preview`);
    }
    ok(`Button.examples.tsx covers all ${titles.length} meta examples`);
  }
}

// ---------------------------------------------------------------------------
// 5. Workflow scripts
//
// These run under the Workflow tool, not node: they combine `export const meta`
// with a top-level `return`, which is neither valid ESM nor CJS, so node --check
// only accepts them once the export is stripped and the body wrapped. Beyond
// syntax, three things fail silently at RUN time and are cheap to catch here:
// a computed `meta` (must be a pure literal), a phase() title with no matching
// meta.phases entry (its progress group silently detaches), and the banned
// non-deterministic globals (they throw, because they would break resume).
// ---------------------------------------------------------------------------
section('Workflow scripts');
{
  const wfDir = join(TEMPLATES, 'workflows');
  if (!existsSync(wfDir)) {
    warn('no templates/workflows/ — skipping');
  } else {
    // Representative inputs per script, so the dry run below can exercise the
    // real control flow. `expect` is the agent count that shape should produce.
    const SAMPLE_ARGS = {
      'build-design-system.mjs': [
        { label: 'in-repo', expect: 10, args: {
          pluginRoot: '/plugin', dsRoot: '/project',
          brief: {
            stack: { primitives: 'base-ui', componentLayer: 'own', cssSystem: 'css-modules', motion: 'css', icons: 'lucide' },
            paths: { root: 'src/design-system', components: 'src/design-system/components' },
            distribution: { mode: 'in-repo' },
          },
        } },
        { label: 'published', expect: 11, args: {
          pluginRoot: '/plugin', dsRoot: '/project',
          brief: {
            stack: { primitives: 'radix', componentLayer: 'own', cssSystem: 'tailwind', motion: 'motion', icons: 'lucide' },
            paths: { root: 'src/ui', components: 'src/ui/components' },
            distribution: { mode: 'public-npm' },
          },
        } },
      ],
    };

    const scratch = mkdtempSync(join(tmpdir(), 'ds-wf-'));
    try {
      const files = [...walk(wfDir)].filter((f) => f.endsWith('.mjs'));
      for (const file of files) {
        const name = relative(TEMPLATES, file);
        const src = readFileSync(file, 'utf8');

        const wrapped = join(scratch, basename(file));
        writeFileSync(wrapped, `(async () => {\n${src.replace(/^export const meta/m, 'const meta')}\n})()`);
        const r = spawnSync(process.execPath, ['--check', wrapped], { encoding: 'utf8' });
        if (r.status !== 0) { fail(`${name}: syntax error\n${r.stderr}`); continue; }

        const metaBlock = /^export const meta = \{[\s\S]*?\n\}/m.exec(src);
        if (!metaBlock) { fail(`${name}: no \`export const meta = {\` block`); continue; }
        const body = metaBlock[0];
        if (!/\bname:\s*['"]/.test(body) || !/\bdescription:\s*['"]/.test(body))
          fail(`${name}: meta needs literal name + description`);
        // Pure literal: no interpolation, spreads or calls inside the meta block.
        if (/\$\{|\.\.\.|[A-Za-z_$][\w$]*\s*\(/.test(body.replace(/^export const meta = /, '')))
          fail(`${name}: meta must be a PURE literal — no interpolation, spreads or calls`);

        const declared = new Set([...body.matchAll(/title:\s*['"]([^'"]+)['"]/g)].map((m) => m[1]));
        const called = new Set([...src.matchAll(/(?:^|[^\w.])phase\(\s*['"]([^'"]+)['"]/g)].map((m) => m[1]));
        for (const t of called)
          if (!declared.has(t)) fail(`${name}: phase(${JSON.stringify(t)}) has no matching meta.phases entry`);
        for (const t of declared)
          if (!called.has(t)) fail(`${name}: meta.phases declares "${t}" but no phase() call uses it`);

        // Banned inside a workflow: they throw at run time (resume determinism).
        for (const banned of [/\bDate\.now\s*\(/, /\bnew Date\s*\(\s*\)/, /\bMath\.random\s*\(/]) {
          const hit = banned.exec(src);
          if (hit) fail(`${name}: uses ${hit[0]} — throws inside a workflow (breaks resume)`);
        }

        // Dry run: execute the REAL control flow with agent() stubbed. Every
        // check above is static, and static checks cannot see the entry
        // contract — which is exactly where this bit in the field: a run died
        // 14ms in, having spawned nothing, because `args` arrived as a JSON
        // string and `args.pluginRoot` was undefined. A script that cannot
        // start is not a syntax error, so nothing above would ever catch it.
        const variants = SAMPLE_ARGS[basename(file)];
        if (!variants) { warn(`${name}: no sample args registered — dry run skipped`); continue; }

        const factory = new Function(
          'return (async (agent, parallel, pipeline, phase, log, args, budget) => {\n' +
            src.replace(/^export const meta/m, 'const meta') +
            '\n})',
        )();

        const dryRun = async (a) => {
          const calls = [];
          const stubAgent = (prompt, opts = {}) => {
            calls.push({ prompt, ...opts });
            return Promise.resolve({ ok: true, summary: 'stub', filesWritten: [], commands: [], followUps: [] });
          };
          const par = (thunks) => Promise.all(thunks.map((t) => t()));
          const pipe = (items, ...stages) =>
            Promise.all(items.map(async (item, i) => {
              let v = item;
              for (const s of stages) v = await s(v, item, i);
              return v;
            }));
          const budget = { total: null, spent: () => 0, remaining: () => Infinity };
          const out = await factory(stubAgent, par, pipe, () => {}, () => {}, a, budget);
          return { calls, out };
        };

        try {
          let baseline = null;
          for (const v of variants) {
            const run = await dryRun(v.args);
            if (v.expect != null && run.calls.length !== v.expect)
              fail(`${name} [${v.label}]: dry run spawned ${run.calls.length} agents, expected ${v.expect}`);
            for (const c of run.calls) {
              if (!c.label) fail(`${name} [${v.label}]: an agent() call has no label`);
              if (c.phase && !declared.has(c.phase))
                fail(`${name} [${v.label}]: agent phase "${c.phase}" is not declared in meta.phases`);
            }
            if (!baseline) baseline = run;
          }

          // The regression that motivated this whole group.
          const asString = await dryRun(JSON.stringify(variants[0].args));
          if (asString.calls.length !== baseline.calls.length)
            fail(`${name}: args as an object and as a JSON string produce different runs ` +
                 `(${baseline.calls.length} vs ${asString.calls.length} agents) — the entry contract must accept both`);

          // And the negative case: no args at all must fail loudly, naming the field.
          let threw = null;
          try { await dryRun(undefined); } catch (e) { threw = e; }
          if (!threw) fail(`${name}: ran with no args at all — the entry contract is not validated`);
          else if (!/pluginRoot/.test(threw.message))
            fail(`${name}: the missing-args error does not name the missing field: ${threw.message}`);

          ok(`${name}: dry run green — ${variants.map((v) => `${v.label} ${v.expect}`).join(', ')} agents, ` +
             `object/string args agree, missing args rejected`);
        } catch (e) {
          fail(`${name}: dry run threw — ${e.message}`);
        }
      }
      ok(`${files.length} workflow script(s): parse, pure literal meta, phases matched, no banned globals`);
    } finally {
      rmSync(scratch, { recursive: true, force: true });
    }
  }
}

// ---------------------------------------------------------------------------
// 6. TSX parse gate
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
