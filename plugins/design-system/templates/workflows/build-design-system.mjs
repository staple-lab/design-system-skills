export const meta = {
  name: 'build-design-system',
  description: 'Scaffold a React design system from design-system.config.json — four parallel phases',
  whenToUse: 'After /design-system:init has run the interview and written the brief. Builds tokens, CSS wiring, motion, wave-1 components, lint rules and the inventory site as concurrent phases.',
  phases: [
    { title: 'Foundation', detail: 'project scaffold + install ∥ token layer → css ∥ motion' },
    { title: 'Wave 1', detail: 'Button ∥ TextField ∥ Dialog ∥ Icon + layout primitives' },
    { title: 'Surfaces', detail: 'lint rules ∥ inventory + AI surface' },
    { title: 'Packaging', detail: 'only when the brief says package' },
  ],
}

// ---------------------------------------------------------------------------
// Inputs. The parent interpolates these — ${CLAUDE_PLUGIN_ROOT} does not expand
// inside a workflow script, so pluginRoot arrives as an absolute path in args.
//
//   args = {
//     pluginRoot: '/abs/path/to/plugins/design-system',
//     dsRoot:     '.',                    // where the design system lives
//     brief:      { ...design-system.config.json... },
//     components: ['Button', 'TextField', 'Dialog', 'Icon+Layout'],   // optional override
//   }
// ---------------------------------------------------------------------------

// Harnesses differ on whether `args` arrives parsed or as the raw JSON string.
// Accept both. This bit once for real: the run died 14ms in with every phase
// unrun, because `args` was a string and `args.pluginRoot` was undefined — the
// most expensive possible form of a trivial bug.
const IN = typeof args === 'string' ? JSON.parse(args) : (args ?? {})

const P = IN.pluginRoot
const T = P + '/templates'
const ROOT = IN.dsRoot || '.'
const BRIEF = IN.brief || {}
const STACK = BRIEF.stack || {}
const PATHS = BRIEF.paths || {}
const COMPONENTS_DIR = PATHS.components || 'src/design-system/components'
const PACKAGED = (BRIEF.distribution || {}).mode && (BRIEF.distribution || {}).mode !== 'in-repo'

if (!P) {
  const shape =
    args == null ? String(args)
    : typeof args === 'string' ? `a ${args.length}-char string that parsed to keys: ${Object.keys(IN).join(', ')}`
    : `an object with keys: ${Object.keys(IN).join(', ')}`
  throw new Error(
    'args.pluginRoot is required — the absolute path to plugins/design-system. Received ' + shape,
  )
}

const REPORT = {
  type: 'object',
  additionalProperties: false,
  required: ['ok', 'summary', 'filesWritten'],
  properties: {
    ok: { type: 'boolean', description: 'true only if everything you were asked to do is done' },
    summary: { type: 'string', description: 'two or three sentences, no preamble' },
    filesWritten: { type: 'array', items: { type: 'string' } },
    commands: {
      type: 'array',
      description: 'commands you actually ran, with their real exit codes',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['cmd', 'exit'],
        properties: { cmd: { type: 'string' }, exit: { type: 'number' } },
      },
    },
    followUps: {
      type: 'array',
      description: 'anything you could not do, or that the parent must decide',
      items: { type: 'string' },
    },
  },
}

// Every agent gets this. The ownership rules are not advice — they are the only
// thing keeping concurrent writers off each other's files.
const COMMON = [
  'You are building one part of a React design system that is being scaffolded right now.',
  '',
  'READ FIRST: ' + ROOT + '/design-system.config.json — the brief. Its decisions are settled;',
  'they are not preferences to revisit. The resolved stack is: primitives=' + (STACK.primitives || '?') +
    ', componentLayer=' + (STACK.componentLayer || '?') + ', cssSystem=' + (STACK.cssSystem || '?') +
    ', motion=' + (STACK.motion || '?') + ', icons=' + (STACK.icons || '?') + '.',
  '',
  'Plugin skills live at ' + P + '/skills/<name>/SKILL.md and templates at ' + T + '.',
  'COPY AND ADAPT the templates — do not write equivalents from memory. They are the tested',
  'versions and have had real bugs fixed in them that a fresh rewrite reintroduces.',
  'Where this brief names a skill, invoke it with the Skill tool if you have one; otherwise',
  'read its SKILL.md at the path above.',
  '',
  'The full phase and ownership contract is ' + P + '/skills/design-system-architect/references/build-phases.md.',
  'Read it if anything below is ambiguous.',
  '',
  'CONCURRENCY RULES — you are running at the same time as sibling agents:',
  '  1. Write ONLY the files listed under "You own". A file you do not own is being written',
  '     by someone else right now; editing it loses one of the two writes.',
  '  2. Do NOT run npm install / npm add / pnpm add. One agent owns installation.',
  '  3. Do NOT run the registry build. The parent runs it once, after your phase.',
  '  4. Do NOT run a whole-project typecheck, lint or build sweep. Half the system does not',
  '     exist yet, so the red output is noise. The parent verifies at the end.',
  '',
  'Return a terse structured report. Report real exit codes, not claims. If you could not do',
  'something, say so in followUps rather than reporting ok:true.',
].join('\n')

const brief = (title, body) => COMMON + '\n\n## Your job: ' + title + '\n\n' + body

// ---------------------------------------------------------------------------
// Phase 0 — two chains that rejoin at wave 1.
//
// Chain A is one long network-bound step (install). Chain B is three short
// authoring steps. Running them as chains rather than as two barriers hides the
// install entirely under the token/css/motion work, which is the single biggest
// wall-clock win in the build: neither C nor D needs node_modules, because A
// owns every install and every piece of build config.
// ---------------------------------------------------------------------------
phase('Foundation')
log('Foundation: scaffold + install running under tokens → css ∥ motion')

const chainA = () =>
  agent(
    brief(
      'project scaffold, dependency install, shared harness',
      [
        'Create the project skeleton and install EVERY dependency the resolved stack needs, in',
        'one pass: React, TypeScript, the primitive layer, the CSS system (and its Vite plugin),',
        'the icon pack, the motion library if the brief names one, and the test + lint toolchain.',
        'You are the only agent permitted to install, so anything missing here blocks a sibling.',
        '',
        'Then copy the shared harness, so the four component authors in the next phase never race',
        'to create it:',
        '  ' + T + '/testing/vitest.config.ts and vitest.setup.ts',
        '  ' + T + '/lint/ → a WORKING BASELINE eslint + stylelint config. A later agent tunes the',
        '    rules; your job is that "npm run lint" exits cleanly from now on.',
        '  ' + T + '/governance/ → CONTRIBUTING.md (the draft→stable gate), rfcs/0000-template.md,',
        '    CODEOWNERS.example. "Nobody owns it" is a failure you prevent at scaffold time.',
        '  ' + T + '/codemods/ → wired as "npm run codemod"',
        '  ' + T + '/registry/build-registry.mjs → scripts/build-registry.mjs',
        '  ' + T + '/mcp/server.mjs → mcp/server.mjs',
        '',
        'Write the COMPLETE scripts block into package.json now, including scripts for tools that',
        'do not exist yet (tokens, registry, test, test:vrt, lint, typecheck, inventory,',
        'inventory:build, codemod, mcp, verify). The tested list is in ' + T + '/package/package.json.',
        'A later agent appending its own script is exactly the write conflict this prevents.',
        '',
        'You own: package.json, package-lock.json, node_modules/, tsconfig.json, vite.config.ts',
        '(including the CSS system plugin), .gitignore, vitest.config.ts, vitest.setup.ts,',
        'eslint.config.mjs, stylelint.config.mjs, tools/eslint-plugin-design-system/,',
        'scripts/build-registry.mjs, mcp/, codemods/, CONTRIBUTING.md, CODEOWNERS, rfcs/.',
        'You must not touch: tokens/, src/design-system/**.',
      ].join('\n'),
    ),
    { label: 'scaffold + install', phase: 'Foundation', schema: REPORT },
  )

const chainB = () =>
  agent(
    brief(
      'the token layer',
      [
        'Follow the design-tokens skill. Copy ' + T + '/tokens/ into ' + ROOT + '/tokens, then run the',
        'colour path the brief names — always the tested script, never hand-computed values:',
        '  one brand hex   → node tokens/generate-ramps.mjs --accent "<hex from the brief>"',
        '  vendor palette  → node tokens/import-palette.mjs --source tailwind|radix ...',
        '  from a product  → node adopt/infer-tokens.mjs --write',
        '  preset          → nothing to run; the shipped files are the preset',
        '',
        'Author the type scale, spacing, radius, elevation and MOTION tokens (duration, easing)',
        'in the same pass — motion values are tokens, and the motion agent downstream consumes',
        'them rather than defining them.',
        '',
        'Then run: node tokens/build.mjs — and heed the contrast gate. A light-peaking hue (greens,',
        'ambers) prints a finding naming its real fill step; apply that documented semantic',
        're-point instead of distorting the ramp. You are not done until the gate exits 0.',
        '',
        'Both scripts are dependency-free on purpose, so do not wait for node_modules — it is being',
        'installed concurrently and you do not need it.',
        '',
        'You own: tokens/** (sources and tokens/dist/). Nothing else. The "tokens" npm script',
        'already exists — do not edit package.json.',
      ].join('\n'),
    ),
    { label: 'tokens', phase: 'Foundation', schema: REPORT },
  ).then((tokensReport) =>
    // C and D depend on tokens/dist only — not on the install still running in chain A.
    parallel([
      () =>
        agent(
          brief(
            'wire tokens into ' + (STACK.cssSystem || 'the CSS system'),
            [
              'Follow the css-systems skill. Make every semantic token reachable the idiomatic way',
              'for ' + (STACK.cssSystem || 'the configured system') + ' — a Tailwind @theme block, a',
              'vanilla-extract contract, a StyleX defineVars, a Panda preset, or a plain CSS-var',
              'sheet — so a component author writes color.bg.accent, never a hex.',
              '',
              'CROSS-AGENT CONTRACT: you own the global stylesheet, and you write into it,',
              'unconditionally, an import of the motion agent\'s CSS:',
              '    @import "../motion/motion.css";',
              'That agent is creating that file right now. Write the import anyway — it resolves at',
              'build time, which is after both of you have finished. Do not wait, and do not create',
              'the file yourself.',
              '',
              'Build config is NOT yours: the Vite plugin for this CSS system is already being',
              'installed and configured by the scaffold agent. If node_modules is incomplete while',
              'you work, that is expected — write files, do not run builds.',
              '',
              'You own: ' + (PATHS.root || 'src/design-system') + '/styles/** and the token bridge for',
              'this CSS system. You must not touch: vite.config.ts, package.json, tokens/.',
            ].join('\n'),
          ),
          { label: 'css wiring', phase: 'Foundation', schema: REPORT },
        ),
      () =>
        agent(
          brief(
            'the motion system',
            [
              'Follow the motion-system skill. The motion tokens (duration, easing) already exist in',
              'the token layer — consume them, do not redefine them.',
              '',
              'Build: the reduced-motion strategy handled ONCE at system level (never per component),',
              'and the shared animation primitives the components will use. The motion answer in the',
              'brief is ' + (STACK.motion || 'unset') + '.',
              '',
              'CROSS-AGENT CONTRACT: create ' + (PATHS.root || 'src/design-system') + '/motion/motion.css',
              'containing the prefers-reduced-motion block. The css agent is writing an import of it',
              'right now. Create it even if the motion answer is CSS-only and the file is nearly',
              'empty — an empty-but-present file is what keeps the contract unconditional.',
              '',
              'This phase runs before the components deliberately: Dialog animates on day one, so the',
              'pattern must exist for its author to consume rather than invent.',
              '',
              'You own: ' + (PATHS.root || 'src/design-system') + '/motion/**. You must not touch the',
              'global stylesheet — the css agent owns it.',
            ].join('\n'),
          ),
          { label: 'motion', phase: 'Foundation', schema: REPORT },
        ),
    ]).then((wiring) => [tokensReport, ...wiring]),
  )

const foundation = await parallel([chainA, chainB])
const foundationReports = [foundation[0], ...(foundation[1] || [])].filter(Boolean)
log('Foundation complete: ' + foundationReports.filter((r) => r && r.ok).length + '/' + foundationReports.length + ' green')

// ---------------------------------------------------------------------------
// Phase 1 — wave 1. Four authors, fully independent: each writes only its own
// component directory. Button/TextField/Dialog exercise every hard problem in
// the system (polymorphism, forms, portals, focus, motion); get them right and
// the rest are variations.
// ---------------------------------------------------------------------------
phase('Wave 1')

const WAVE_1 = [
  {
    name: 'Button',
    detail: 'Variants, sizes, loading and disabled states, icon-before/icon-after slots, and the polymorphism convention this system uses. An icon-only Button must not COMPILE without an accessible name — encode the invariant in the props type, not in a lint rule.',
  },
  {
    name: 'TextField',
    detail: 'Label, description and error, wired so the error is announced and the description is referenced. Controlled AND uncontrolled with identical behaviour. Native form integration: it must work inside a plain <form> submission with no adapter.',
  },
  {
    name: 'Dialog',
    detail: 'Portal, focus trap, focus restoration to the trigger, scroll lock, and enter/exit animation using the motion primitives that already exist. Never hand-roll the focus trap — the primitive layer owns it.',
  },
  {
    name: 'Icon + layout primitives',
    detail:
      'Four small components in one agent, because they share a property: no state, no ARIA of their own, nothing to wrap. Icon starts from ' + T + '/components/Icon/Icon.tsx and follows the icon-system skill (the pack is ' + (STACK.icons || 'per the brief') + '); it must handle decorative-vs-meaningful correctly. Box, Stack and Inline take TOKEN-GATED style props only — a spacing prop accepts scale steps, never arbitrary px. They are what stops product teams hand-rolling flex divs on day one.',
  },
]

const waveReports = await parallel(
  WAVE_1.map((c) => () =>
    agent(
      brief(
        'build ' + c.name,
        [
          c.detail,
          '',
          'Build it end to end: props API, primitive wrapper, token-only styles, motion where it',
          'opens/closes/expands, the behavioural test suite, and the <Name>.meta.json registry file.',
          'The bar is not "it works" — it is that a reviewer cannot tell it was written by someone',
          'different from the rest of the library.',
          '',
          'The harness, the lint config and the build config ALREADY EXIST. Three sibling authors are',
          'building other components right now.',
          '  - Write only ' + COMPONENTS_DIR + '/<YourComponent>/** and nothing else.',
          '  - Do NOT regenerate the registry — concurrent regens race on registry.json and the',
          '    loser silently vanishes from the docs. The parent runs it once when you all return.',
          '  - Do NOT create or edit vitest/eslint/tsconfig/package.json.',
          '',
          'Run your own tests before claiming done; do not run a whole-project sweep.',
        ].join('\n'),
      ),
      {
        label: c.name,
        phase: 'Wave 1',
        schema: REPORT,
        agentType: 'design-system:ds-component-author',
      },
    ),
  ),
)

const built = waveReports.filter(Boolean)
log('Wave 1: ' + built.filter((r) => r.ok).length + '/' + WAVE_1.length + ' components green')

// ---------------------------------------------------------------------------
// Phase 2 — surfaces. Both read what wave 1 produced, so the registry is built
// exactly once here, by a single agent, before either fans out.
// ---------------------------------------------------------------------------
phase('Surfaces')

const surfaces = await parallel([
  () =>
    agent(
      brief(
        'the enforcement layer',
        [
          'Follow the design-system-linting skill. The baseline eslint + stylelint config already',
          'exists — you are TUNING it, not creating it.',
          '',
          'Point the custom rules (no-raw-color, no-hardcoded-dimension, no-primitive-token,',
          'no-deep-import) at the real generated token file, so a rule can never disagree with the',
          'tokens. Every message must name the replacement token — a rule that says "no raw hex"',
          'without saying what to use instead just gets disabled.',
          '',
          'Then run the DS rules over the wave-1 components and fix what they legitimately catch.',
          '',
          'You own: eslint.config.mjs, stylelint.config.mjs, tools/eslint-plugin-design-system/**.',
          'You must not touch: inventory/, the components, tokens/.',
        ].join('\n'),
      ),
      { label: 'lint rules', phase: 'Surfaces', schema: REPORT },
    ),
  () =>
    agent(
      brief(
        'the inventory site and the AI surface',
        [
          'Follow the component-inventory skill.',
          '',
          '1. Build the registry: node scripts/build-registry.mjs --agents. You are the only agent',
          '   in this phase permitted to run it.',
          '2. Copy and adapt ' + T + '/inventory/ — the site reads registry.json and tokens.json, and',
          '   is styled entirely with the system\'s own tokens. That is dogfooding, not tidiness: a',
          '   token that does not work fails here before it reaches a product.',
          '3. Author the Patterns and Content starter pages. These are the one deliberately',
          '   hand-written part of the site, because cross-component judgement has no code to be',
          '   generated from.',
          '4. Generate the AI surface from the same registry: AGENTS.md and llms.txt. Without it,',
          '   coding agents invent component names and hardcode hex values.',
          '5. Wire visual regression: ' + T + '/testing/playwright.config.ts and',
          '   ' + T + '/testing/vrt/inventory.vrt.spec.ts screenshot the inventory site itself, so',
          '   every component\'s visual baseline comes free with its docs page.',
          '',
          'You own: inventory/**, AGENTS.md, llms.txt, playwright.config.ts, tests/vrt/**.',
          'You must not touch: lint configs, the components.',
        ].join('\n'),
      ),
      { label: 'inventory + AI surface', phase: 'Surfaces', schema: REPORT },
    ),
])

// ---------------------------------------------------------------------------
// Phase 3 — packaging, only when the brief actually asks for it.
// ---------------------------------------------------------------------------
let packaging = null
if (PACKAGED) {
  phase('Packaging')
  log('distribution.mode is ' + BRIEF.distribution.mode + ' — building the package surface')
  packaging = await agent(
    brief(
      'package the system for distribution',
      [
        'Follow the packaging-distribution skill. Distribution mode is ' + BRIEF.distribution.mode + '.',
        '',
        'Exports map with "types" FIRST in every condition, dual ESM/CJS, sideEffects listing the',
        'CSS (false makes bundlers tree-shake the stylesheet away — the library that renders',
        'unstyled in production and works locally), React as a peer dependency and never a',
        'dependency, "use client" where RSC needs it, and changesets for versioning.',
        '',
        'Start from ' + T + '/package/package.json and ' + T + '/package/ci.yml.',
        'Verify with publint and attw --pack, and report their real output.',
      ].join('\n'),
    ),
    { label: 'packaging', phase: 'Packaging', schema: REPORT },
  )
} else {
  log('distribution.mode is in-repo — skipping packaging (no version boundary wanted)')
}

// ---------------------------------------------------------------------------
// The parent verifies. Deliberately NOT done here: a workflow agent reporting
// "tests pass" is a claim, and the point of verification is that the user sees
// the real output in the transcript.
// ---------------------------------------------------------------------------
const all = [...foundationReports, ...built, ...surfaces.filter(Boolean), packaging].filter(Boolean)
const followUps = all.flatMap((r) => r.followUps || [])

return {
  built: WAVE_1.map((c) => c.name),
  packaged: Boolean(PACKAGED),
  agents: all.length,
  failed: all.filter((r) => !r.ok).map((r) => r.summary),
  followUps,
  filesWritten: all.flatMap((r) => r.filesWritten || []),
  nextForParent: [
    'npm run tokens        (alone, first — everything reads its output)',
    'then IN PARALLEL, one message: npx tsc --noEmit | npm test | npm run lint | npm run inventory:build | npm run registry:check',
    'then: npm run inventory -- --open, in the background, and report the URL',
  ],
}
