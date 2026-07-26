#!/usr/bin/env node
/**
 * Thin runner over jscodeshift with the defaults this repo always wants: the tsx
 * parser (plain "ts" chokes on JSX), every JS/TS extension, and node_modules/dist
 * ignored. Dependency-free — it shells out to the locally installed jscodeshift.
 *
 *   npm run codemod -- <transform> <paths...> [jscodeshift flags]
 *   npm run codemod -- rename-prop src/ -d -p --component=Button --from=leftIcon --to=startIcon
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const transformsDir = fileURLToPath(new URL('../transforms/', import.meta.url));

const args = process.argv.slice(2);
const positional = args.filter((a) => !a.startsWith('-'));
const passthrough = args.filter((a) => a.startsWith('-'));
const [name, ...paths] = positional;

function listTransforms() {
  return readdirSync(transformsDir)
    .filter((f) => f.endsWith('.cjs'))
    .map((f) => `  ${f.replace(/\.cjs$/, '')}`)
    .join('\n');
}

if (!name || !paths.length) {
  console.error('Usage: npm run codemod -- <transform> <paths...> [jscodeshift flags]');
  console.error(`\nAvailable transforms:\n${listTransforms()}`);
  process.exit(1);
}

const transform = join(transformsDir, name.endsWith('.cjs') ? name : `${name}.cjs`);
if (!existsSync(transform)) {
  console.error(`No transform "${name}" in codemods/transforms/. Available:\n${listTransforms()}`);
  process.exit(1);
}

const result = spawnSync(
  'npx',
  [
    'jscodeshift',
    '--transform',
    transform,
    '--parser=tsx',
    '--extensions=tsx,ts,jsx,js',
    '--ignore-pattern=**/node_modules/**',
    '--ignore-pattern=**/dist/**',
    // User flags come last so they can override any default above (e.g. --parser=flow).
    ...passthrough,
    ...paths,
  ],
  { stdio: 'inherit', shell: process.platform === 'win32' },
);

process.exit(result.status ?? 1);
