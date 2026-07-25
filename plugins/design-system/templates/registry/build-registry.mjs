#!/usr/bin/env node
/**
 * Registry build — code + tokens in, one machine-readable catalogue out.
 *
 *   components/<Name>/<Name>.tsx        props extracted from the real TypeScript types
 *   components/<Name>/<Name>.meta.json  the judgement calls (status, guidance, do/don't)
 *   components/<Name>/*.css|css.ts      tokens consumed, scanned
 *   .vitest-report.json                 test + a11y status from the last run
 *   .eslint-report.json                 lint status from the last run
 *
 * Emits .design-system/registry.json and (optionally) AGENTS.md.
 *
 * Docs drift from code because they get written twice. Everything downstream — the
 * inventory site, the AI contract, the adoption report — is a VIEW over this file.
 *
 * Usage: node scripts/build-registry.mjs [--check] [--agents]
 *   --check   fail if the committed registry differs (run this in CI)
 *   --agents  also write AGENTS.md
 *
 * Props extraction is dependency-free by default so this runs anywhere. If
 * `react-docgen-typescript` is installed it is used instead — it resolves generics,
 * unions and inherited props properly, which the built-in parser does not attempt.
 */

import { readFileSync, writeFileSync, readdirSync, existsSync, statSync, mkdirSync } from 'node:fs';
import { join, dirname, relative, resolve, sep } from 'node:path';

const ROOT = process.cwd();
const args = new Set(process.argv.slice(2));

const config = existsSync(join(ROOT, 'design-system.config.json'))
  ? JSON.parse(readFileSync(join(ROOT, 'design-system.config.json'), 'utf8'))
  : {};

const PATHS = {
  components: config.paths?.components ?? 'src/design-system/components',
  registry: config.paths?.registry ?? '.design-system/registry.json',
  tokens: config.paths?.tokens ?? 'tokens',
};

// ---------------------------------------------------------------------------
// TypeScript props extraction (dependency-free fallback)
// ---------------------------------------------------------------------------

/** Find the matching close for the brace at `open`, respecting strings and comments. */
function matchBrace(source, open) {
  let depth = 0;
  let inStr = null;
  for (let i = open; i < source.length; i++) {
    const ch = source[i];
    if (inStr) {
      if (ch === inStr && source[i - 1] !== '\\') inStr = null;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') inStr = ch;
    else if (source.slice(i, i + 2) === '/*') i = source.indexOf('*/', i + 2) + 1;
    else if (source.slice(i, i + 2) === '//') i = source.indexOf('\n', i);
    else if (ch === '{') depth++;
    else if (ch === '}' && --depth === 0) return i;
    if (i < 0) break;
  }
  return -1;
}

/**
 * Split an interface body into members at top-level `;`/newline, keeping each member's
 * JSDoc attached. A regex cannot do this correctly: `onChange?: (v: string) => void`
 * contains both a colon and a semicolon inside parens, and a multi-line JSDoc block
 * contains the newline that would otherwise end the member.
 */
function parseMembers(body) {
  const members = [];
  let i = 0;
  let cur = '';
  let doc = null;
  let depth = 0;
  let inStr = null;

  const flush = () => {
    const text = cur.trim();
    if (text) members.push({ doc, text });
    cur = '';
    doc = null;
  };

  while (i < body.length) {
    const two = body.slice(i, i + 2);
    if (!inStr && two === '/*') {
      const end = body.indexOf('*/', i + 2);
      if (body[i + 2] === '*' && !cur.trim()) doc = body.slice(i + 3, end < 0 ? body.length : end);
      i = end < 0 ? body.length : end + 2;
      continue;
    }
    if (!inStr && two === '//') {
      const nl = body.indexOf('\n', i);
      i = nl < 0 ? body.length : nl;
      continue;
    }
    const ch = body[i];
    if (inStr) {
      cur += ch;
      if (ch === inStr && body[i - 1] !== '\\') inStr = null;
      i++;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') {
      inStr = ch;
      cur += ch;
      i++;
      continue;
    }
    // Deliberately not tracking < > — `=>` would unbalance them.
    if (ch === '(' || ch === '[' || ch === '{') depth++;
    else if (ch === ')' || ch === ']' || ch === '}') depth--;
    if ((ch === ';' || ch === '\n') && depth === 0) {
      flush();
      i++;
      continue;
    }
    cur += ch;
    i++;
  }
  flush();
  return members;
}

const MEMBER_RE = /^(?:readonly\s+)?(['"]?)([A-Za-z_$][\w$-]*)\1(\?)?\s*:\s*([\s\S]+)$/;
const NATIVE_RE = /ComponentProps(?:WithRef|WithoutRef)?<\s*['"]([a-z]+)['"]\s*>/;

/**
 * Collect members for a named type, following the shapes a design system actually uses:
 *
 *   interface ButtonBaseProps extends Omit<ComponentPropsWithRef<'button'>, 'color'>, VariantProps<…> { … }
 *   type ButtonProps = ButtonBaseProps & ({ children: ReactNode } | { 'aria-label': string })
 *
 * The second form is common and important — it is how a required `aria-label` gets
 * enforced for icon-only usage — so following the intersection is not optional.
 */
function collectMembers(source, typeName, seen = new Set(), acc = { props: new Map(), extendsNative: null }) {
  if (seen.has(typeName)) return acc;
  seen.add(typeName);

  const decl = new RegExp(`(?:export\\s+)?(interface|type)\\s+${typeName}\\b([^{;=]*)(=?)`, 'm').exec(source);
  if (!decl) return acc;

  const isInterface = decl[1] === 'interface';
  const headEnd = decl.index + decl[0].length;

  // The region that can name other types: an interface's `extends` clause, or the whole RHS.
  let heritage = decl[2] ?? '';
  let bodies = [];

  if (isInterface) {
    const open = source.indexOf('{', headEnd - 1);
    const close = matchBrace(source, open);
    if (open >= 0 && close > open) bodies.push(source.slice(open + 1, close));
  } else {
    // Type alias: take the RHS up to the first top-level `;` or blank line.
    let i = headEnd;
    let depth = 0;
    let rhs = '';
    while (i < source.length) {
      const ch = source[i];
      if (ch === '{' || ch === '(' || ch === '[') depth++;
      else if (ch === '}' || ch === ')' || ch === ']') depth--;
      if (depth === 0 && (ch === ';' || (ch === '\n' && rhs.trim() && !/[&|,({[]\s*$/.test(rhs)))) break;
      rhs += ch;
      i++;
    }
    heritage = rhs;
    // Every object literal in the RHS contributes members (union branches included).
    let j = 0;
    while ((j = rhs.indexOf('{', j)) >= 0) {
      const close = matchBrace(rhs, j);
      if (close < 0) break;
      bodies.push(rhs.slice(j + 1, close));
      j = close + 1;
    }
  }

  const native = NATIVE_RE.exec(heritage);
  if (native && !acc.extendsNative) acc.extendsNative = native[1];

  for (const body of bodies) {
    for (const { doc, text } of parseMembers(body)) {
      const m = MEMBER_RE.exec(text);
      if (!m) continue;
      const [, , name, optional, rawType] = m;
      if (acc.props.has(name)) continue; // first declaration wins
      const parsed = parseDoc(doc);
      acc.props.set(name, {
        name,
        type: rawType.trim().replace(/\s+/g, ' ').replace(/;$/, ''),
        required: !optional,
        description: parsed.description,
        default: parsed.default ?? null,
        deprecated: parsed.deprecated ?? null,
      });
    }
  }

  // Follow referenced *Props types (base interfaces, intersections).
  for (const ref of heritage.matchAll(/\b([A-Z][\w$]*Props)\b/g)) {
    collectMembers(source, ref[1], seen, acc);
  }

  return acc;
}

/**
 * Replace the CONTENTS of string literals with spaces, preserving length so indices still
 * line up with the original. Without this, a Tailwind class value like
 * `'hover:bg-accent-hover'` reads as an object key and `hover` shows up as a variant.
 */
function blankStrings(s) {
  let out = '';
  let inStr = null;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (inStr) {
      const closing = ch === inStr && s[i - 1] !== '\\';
      out += closing ? ch : ' ';
      if (closing) inStr = null;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') {
      inStr = ch;
      out += ch;
      continue;
    }
    out += ch;
  }
  return out;
}

function depthAt(block, idx) {
  let d = 0;
  let inStr = null;
  for (let i = 0; i < idx; i++) {
    const ch = block[i];
    if (inStr) {
      if (ch === inStr && block[i - 1] !== '\\') inStr = null;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') inStr = ch;
    else if (ch === '{') d++;
    else if (ch === '}') d--;
  }
  return d;
}

/**
 * `VariantProps<typeof buttonVariants>` is inferred by TypeScript from the CVA config, so
 * no amount of type-text parsing will find `variant` or `size`. Read them from the CVA
 * call itself — this is the dominant variant pattern, and without it the props table is
 * missing exactly the props people look up most.
 */
function extractCvaVariants(source) {
  const idx = source.search(/variants\s*:\s*\{/);
  if (idx < 0) return {};
  const open = source.indexOf('{', idx);
  const close = matchBrace(source, open);
  if (close < 0) return {};
  const block = blankStrings(source.slice(open + 1, close));

  const out = {};
  for (const m of block.matchAll(/(['"]?)([\w$-]+)\1\s*:\s*\{/g)) {
    if (depthAt(block, m.index) !== 0) continue;
    const o = m.index + m[0].length - 1;
    const c = matchBrace(block, o);
    if (c < 0) continue;
    const inner = block.slice(o + 1, c);
    const values = [];
    for (const k of inner.matchAll(/(['"]?)([\w$-]+)\1\s*:/g)) {
      if (depthAt(inner, k.index) === 0) values.push(k[2]);
    }
    if (values.length) out[m[2]] = values;
  }
  return out;
}

function extractProps(source, componentName) {
  const { props, extendsNative } = collectMembers(source, `${componentName}Props`);
  const defaults = extractDefaults(source, componentName);

  for (const [name, values] of Object.entries(extractCvaVariants(source))) {
    if (props.has(name)) continue;
    const isBoolean = values.every((v) => v === 'true' || v === 'false');
    props.set(name, {
      name,
      type: isBoolean ? 'boolean' : values.map((v) => `'${v}'`).join(' | '),
      required: false,
      description: '',
      default: null,
      deprecated: null,
      source: 'variants',
    });
  }

  const list = [...props.values()];
  for (const p of list) if (p.default == null && defaults[p.name] != null) p.default = defaults[p.name];
  return { props: list, extendsNative };
}

function parseDoc(block) {
  if (!block) return { description: '' };
  const lines = block.split('\n').map((l) => l.replace(/^\s*\*\s?/, '').trimEnd());
  const out = { description: '' };
  const descLines = [];
  for (const line of lines) {
    const tag = /^@(\w+)\s*(.*)$/.exec(line.trim());
    if (tag) {
      if (tag[1] === 'default') out.default = tag[2].trim();
      else if (tag[1] === 'deprecated') out.deprecated = tag[2].trim() || 'Deprecated';
    } else if (line.trim()) descLines.push(line.trim());
  }
  out.description = descLines.join(' ').trim();
  return out;
}

/** Defaults live in the destructure or in CVA's defaultVariants — read both. */
function extractDefaults(source, componentName) {
  const out = {};

  const destructure = new RegExp(
    `(?:function|const)\\s+${componentName}\\b[^{(]*\\(\\s*\\{([\\s\\S]*?)\\}\\s*(?::|,|\\))`,
  ).exec(source);
  if (destructure) {
    for (const m of destructure[1].matchAll(/([A-Za-z_$][\w$]*)\s*=\s*([^,}\n]+)/g)) {
      out[m[1]] = m[2].trim();
    }
  }

  const dv = /defaultVariants\s*:\s*\{([\s\S]*?)\}/.exec(source);
  if (dv) {
    for (const m of dv[1].matchAll(/([A-Za-z_$][\w$]*)\s*:\s*(['"][^'"]*['"]|[\w.]+)/g)) {
      out[m[1]] ??= m[2].trim();
    }
  }

  return out;
}

/** Prefer react-docgen-typescript when the consumer has it — it resolves what regex cannot. */
async function docgenProps(files) {
  try {
    const { withCustomConfig, withDefaultConfig } = await import('react-docgen-typescript');
    const tsconfig = join(ROOT, 'tsconfig.json');
    const parser = existsSync(tsconfig)
      ? withCustomConfig(tsconfig, { shouldExtractLiteralValuesFromEnum: true, savePropValueAsString: true })
      : withDefaultConfig({ savePropValueAsString: true });
    const parsed = parser.parse(files);
    const byComponent = new Map();
    for (const doc of parsed) {
      byComponent.set(doc.displayName, {
        props: Object.values(doc.props ?? {}).map((p) => ({
          name: p.name,
          type: p.type?.name ?? 'unknown',
          required: !!p.required,
          description: p.description ?? '',
          default: p.defaultValue?.value ?? null,
          deprecated: p.tags?.deprecated ?? null,
        })),
        extendsNative: null,
      });
    }
    return byComponent;
  } catch {
    return null; // not installed — the built-in parser handles it
  }
}

// ---------------------------------------------------------------------------
// scanning
// ---------------------------------------------------------------------------

const IGNORE = new Set(['node_modules', '.git', 'dist', 'build', '.next', 'coverage', '.design-system']);

function walk(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir)) {
    if (IGNORE.has(entry)) continue;
    const p = join(dir, entry);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

/**
 * Map CSS var name → token path from the generated token file.
 *
 * The naive inverse (`replace(/-/g, '.')`) is WRONG: `--ds-color-bg-accent-hover` is the
 * token `color.bg.accent-hover`, not `color.bg.accent.hover`, and hyphenated token names
 * are common. Only the token file knows which dashes are separators.
 */
function loadVarMap(prefix) {
  const path = join(ROOT, PATHS.tokens, 'dist', 'tokens.json');
  const json = readJsonIfExists(path);
  const map = new Map();
  for (const theme of Object.values(json?.themes ?? {})) {
    for (const [tokenPath, token] of Object.entries(theme)) {
      const name = String(token.var ?? '').replace(/^var\(|\)$/g, '');
      if (name) map.set(name, tokenPath);
    }
  }
  if (!map.size) console.warn(`  ! no ${relative(ROOT, path)} — run the token build first for accurate token attribution`);
  return map;
}

/** Which tokens does this component consume? Makes "what breaks if I change this token" a lookup. */
function scanTokens(files, prefix, varMap) {
  const found = new Set();
  const unknown = new Set();
  const cssVar = new RegExp(`--${prefix}-[a-z0-9-]+`, 'g');
  for (const f of files) {
    const src = readFileSync(f, 'utf8');
    for (const m of src.matchAll(cssVar)) {
      const path = varMap.get(m[0]);
      if (path) found.add(path);
      else unknown.add(m[0]); // a typo'd var resolves to nothing at runtime and fails silently
    }
    // vanilla-extract / StyleX object access: vars.color.bg.accent, tokens.colorBgAccent
    for (const m of src.matchAll(/\b(?:vars|tokens)\.([a-zA-Z][\w.]*)/g)) found.add(m[1]);
  }
  return { tokens: [...found].sort(), unknownTokens: [...unknown].sort() };
}

function readJsonIfExists(p) {
  try {
    return JSON.parse(readFileSync(p, 'utf8'));
  } catch {
    return null;
  }
}

/** Test + a11y status from the last `vitest --reporter=json` run. A number, not a claim. */
function testStatusFor(name, report) {
  if (!report) return null;
  const results = report.testResults ?? [];
  const mine = results.filter((r) => (r.name ?? '').includes(`${sep}${name}`) || (r.name ?? '').includes(`/${name}.`));
  if (!mine.length) return null;
  const assertions = mine.flatMap((r) => r.assertionResults ?? []);
  const titles = assertions.map((a) => `${a.ancestorTitles?.join(' ') ?? ''} ${a.title ?? ''}`.toLowerCase());
  return {
    total: assertions.length,
    passing: assertions.filter((a) => a.status === 'passed').length,
    failing: assertions.filter((a) => a.status === 'failed').length,
    coverage: null,
    hasKeyboardTests: titles.some((t) => /keyboard|arrow|escape|tab|focus/.test(t)),
    hasAxeTests: titles.some((t) => /axe|a11y|accessib/.test(t)),
  };
}

function lintStatusFor(componentDir, report) {
  if (!report) return null;
  const mine = report.filter((r) => resolve(r.filePath ?? '').startsWith(resolve(componentDir)));
  if (!mine.length) return null;
  return {
    errors: mine.reduce((n, r) => n + (r.errorCount ?? 0), 0),
    warnings: mine.reduce((n, r) => n + (r.warningCount ?? 0), 0),
  };
}

/** Adoption: where is it actually used, and what hand-rolled equivalents still exist? */
function adoptionFor(name, productFiles) {
  const usageRe = new RegExp(`<${name}[\\s/>]`);
  const files = productFiles.filter((f) => usageRe.test(readFileSync(f, 'utf8')));
  return { usages: files.length, files: files.map((f) => relative(ROOT, f)).slice(0, 50) };
}

// ---------------------------------------------------------------------------
// build
// ---------------------------------------------------------------------------

async function build() {
  const componentsDir = join(ROOT, PATHS.components);
  if (!existsSync(componentsDir)) {
    console.error(`✗ No components directory at ${PATHS.components} (set paths.components in design-system.config.json)`);
    process.exit(1);
  }

  const prefix = config.tokens?.prefix ?? 'ds';
  const varMap = loadVarMap(prefix);
  const vitestReport = readJsonIfExists(join(ROOT, '.vitest-report.json'));
  const eslintReport = readJsonIfExists(join(ROOT, '.eslint-report.json'));

  const dirs = readdirSync(componentsDir).filter((d) => statSync(join(componentsDir, d)).isDirectory());

  // Product code = everything outside the design system, for adoption counting.
  const dsRoot = resolve(ROOT, config.paths?.root ?? PATHS.components);
  const productFiles = walk(join(ROOT, 'src'))
    .filter((f) => /\.(tsx|jsx)$/.test(f) && !resolve(f).startsWith(dsRoot));

  const sourceFiles = dirs.map((d) => join(componentsDir, d, `${d}.tsx`)).filter(existsSync);
  const docgen = await docgenProps(sourceFiles);
  if (docgen) console.log('  using react-docgen-typescript for props extraction');

  const components = [];

  for (const name of dirs) {
    const dir = join(componentsDir, name);
    const files = walk(dir);
    const entry = join(dir, `${name}.tsx`);
    if (!existsSync(entry)) {
      console.warn(`  ! ${name}: no ${name}.tsx — skipped`);
      continue;
    }

    const source = readFileSync(entry, 'utf8');
    const extracted = docgen?.get(name) ?? extractProps(source, name);
    const meta = readJsonIfExists(join(dir, `${name}.meta.json`)) ?? {};

    if (!meta.status) console.warn(`  ! ${name}: no ${name}.meta.json — defaulting to draft`);

    const tests = testStatusFor(name, vitestReport);
    const { tokens, unknownTokens } = scanTokens(files, prefix, varMap);
    if (unknownTokens.length) {
      console.warn(`  ! ${name}: ${unknownTokens.length} unknown token var(s) — these resolve to nothing at runtime: ${unknownTokens.join(', ')}`);
    }

    components.push({
      name,
      status: meta.status ?? 'draft',
      since: meta.since ?? null,
      category: meta.category ?? 'Uncategorised',
      summary: meta.summary ?? '',
      description: meta.description ?? '',
      synonyms: meta.synonyms ?? [],
      useFor: meta.useFor ?? [],
      dontUseFor: meta.dontUseFor ?? [],
      sourcePath: relative(ROOT, entry),
      parts: meta.parts ?? [],
      props: extracted.props,
      propsExtendNative: extracted.extendsNative,
      keyboard: meta.keyboard ?? [],
      a11y: {
        ...(meta.a11y ?? {}),
        axeStatus: tests?.hasAxeTests ? (tests.failing === 0 ? 'pass' : 'fail') : 'unknown',
      },
      doDont: meta.doDont ?? [],
      examples: meta.examples ?? [],
      tokens,
      unknownTokens,
      tests,
      lint: lintStatusFor(dir, eslintReport),
      bundle: meta.bundle ?? null,
      adoption: {
        ...adoptionFor(name, productFiles),
        shadowImplementations: meta.shadowImplementations ?? [],
      },
      deprecation: meta.deprecation ?? null,
      related: meta.related ?? [],
    });
  }

  components.sort((a, b) => a.name.localeCompare(b.name));

  const byStatus = {};
  for (const c of components) byStatus[c.status] = (byStatus[c.status] ?? 0) + 1;

  const registry = {
    generated: 'scripts/build-registry.mjs',
    system: {
      name: config.name ?? 'design-system',
      version: config.version ?? '0.0.0',
      packageName: config.distribution?.packageName ?? null,
      primitives: config.stack?.primitives ?? 'unknown',
      cssSystem: config.stack?.cssSystem ?? 'unknown',
      motion: config.stack?.motion ?? 'none',
    },
    counts: { total: components.length, byStatus },
    components,
  };

  const outPath = join(ROOT, PATHS.registry);
  const next = JSON.stringify(registry, null, 2) + '\n';

  if (args.has('--check')) {
    const current = existsSync(outPath) ? readFileSync(outPath, 'utf8') : '';
    if (current !== next) {
      console.error(
        `✗ ${PATHS.registry} is stale. Run \`npm run registry\` and commit the result.\n` +
          `  This check is what makes "the docs are always current" true rather than aspirational.`,
      );
      process.exit(1);
    }
    console.log(`✓ registry up to date (${components.length} components)`);
    return;
  }

  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, next);
  console.log(`✓ ${components.length} components → ${PATHS.registry}`);
  console.log(`  ${Object.entries(byStatus).map(([s, n]) => `${n} ${s}`).join(', ')}`);

  // Quality gate: a component claiming `stable` has made a promise. Hold it to it.
  const incomplete = components.filter(
    (c) => c.status === 'stable' && (!c.examples.length || !c.doDont.length || !c.summary),
  );
  if (incomplete.length) {
    console.warn(
      `\n! ${incomplete.length} stable component(s) missing summary, examples or do/don't guidance:\n` +
        incomplete.map((c) => `    ${c.name}`).join('\n') +
        `\n  The bar has to be mechanical or it moves.`,
    );
  }

  if (args.has('--agents') || config.ai?.generateAgentsMd) writeAgentsMd(registry);
}

// ---------------------------------------------------------------------------
// AGENTS.md — the same source of truth, shaped for a coding agent
// ---------------------------------------------------------------------------

function writeAgentsMd(registry) {
  const pkg = registry.system.packageName ?? config.paths?.root ?? '@/design-system';
  const prefix = config.tokens?.prefix ?? 'ds';
  const shipped = registry.components.filter((c) => c.status !== 'draft');

  const rows = shipped
    .map((c) => {
      const props = c.props
        .filter((p) => !p.name.startsWith('aria-') && !p.name.startsWith('data-'))
        .slice(0, 8)
        .map((p) => p.name)
        .join(', ');
      return `| ${c.name} | ${c.status} | ${c.useFor[0] ?? c.summary ?? '—'} | ${c.dontUseFor[0] ?? '—'} | ${props} |`;
    })
    .join('\n');

  const md = `<!-- GENERATED by scripts/build-registry.mjs — do not edit. -->
# Design system: ${registry.system.name}

Import from \`${pkg}\`. Never from \`${pkg}/dist/*\`, and never from the primitives (\`${registry.system.primitives}\`) directly — if a component is missing, say so rather than building a one-off.

## Rules

- **Semantic tokens only.** \`var(--${prefix}-color-bg-accent)\`. Never a raw hex, and never a primitive-tier token like \`--${prefix}-color-accent-600\` — primitives don't re-theme.
- **Spacing from the scale.** \`var(--${prefix}-space-4)\`. Never a raw px value.
- **State from \`data-*\` attributes**, not from React state: \`[data-state='open']\`, \`[data-disabled]\`.
- **\`:focus-visible\`, never \`:focus\`.** Every interactive element needs a visible ring.
- **Icon-only buttons require \`aria-label\`** — the prop types enforce it.
- Full token list: \`${PATHS.tokens}/dist/tokens.json\`. Full component data: \`${PATHS.registry}\`.

## Components (${Object.entries(registry.counts.byStatus).map(([s, n]) => `${n} ${s}`).join(', ')})

| Component | Status | Use for | Don't use for | Props |
|---|---|---|---|---|
${rows}
${
  registry.components.some((c) => c.deprecation)
    ? `\n## Deprecated — do not use in new code\n\n${registry.components
        .filter((c) => c.deprecation)
        .map((c) => `- **${c.name}** → use \`${c.deprecation.replacedBy}\`${c.deprecation.removeIn ? ` (removed in ${c.deprecation.removeIn})` : ''}`)
        .join('\n')}\n`
    : ''
}`;

  writeFileSync(join(ROOT, 'AGENTS.md'), md);
  console.log('  → AGENTS.md');
}

build();
