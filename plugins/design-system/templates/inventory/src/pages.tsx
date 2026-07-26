import { createElement, useMemo, useState } from 'react';
import { StatusDot } from './App';
import { categories, consumersOf, examplesFor, registry, searchTokens, tokens, themeNames, type Component, type Token } from './data';

export function Overview({ results, query }: { results: Component[]; query: string }) {
  const { system, counts } = registry;

  // The hero numbers are the build gates, measured — the same figures CI enforces.
  const tokenCount = Object.keys(tokens.themes[themeNames[0]] ?? {}).length;
  const contrast = tokens.contrast.filter((c) => c.theme === themeNames[0]);
  const contrastPassing = contrast.filter((c) => c.pass).length;
  const tested = registry.components.filter((c) => c.tests);
  const testsTotal = tested.reduce((n, c) => n + (c.tests?.total ?? 0), 0);
  const testsPassing = tested.reduce((n, c) => n + (c.tests?.passing ?? 0), 0);

  const grouped = useMemo(() => {
    const map = new Map<string, Component[]>();
    for (const c of results) map.set(c.category, [...(map.get(c.category) ?? []), c]);
    return [...map.entries()].sort(([a], [b]) => categories.indexOf(a) - categories.indexOf(b));
  }, [results]);

  return (
    <article className="page">
      <header className="page-head hero">
        <p className="eyebrow">Design system</p>
        <h1>{system.name}</h1>
        <p className="lede">
          {counts.total} components on {system.primitives}, styled with {system.cssSystem}
          {system.motion !== 'none' && `, animated with ${system.motion}`}. Everything on this site
          is generated from the registry — the props, the numbers, and the pictures.
        </p>

        <dl className="hero-stats">
          <div className="hero-stat">
            <dt>Components</dt>
            <dd>
              {counts.total} <small>{counts.byStatus.stable ?? 0} stable</small>
            </dd>
          </div>
          <div className="hero-stat">
            <dt>Tokens</dt>
            <dd>{tokenCount}</dd>
          </div>
          <div className="hero-stat">
            <dt>Contrast pairs</dt>
            <dd className={contrastPassing === contrast.length ? 'ok' : 'no'}>
              {contrastPassing}/{contrast.length} <small>build-gated</small>
            </dd>
          </div>
          <div className="hero-stat">
            <dt>Tests</dt>
            <dd className={testsTotal > 0 && testsPassing === testsTotal ? 'ok' : undefined}>
              {testsTotal > 0 ? `${testsPassing}/${testsTotal}` : '—'} <small>measured</small>
            </dd>
          </div>
        </dl>
      </header>

      {grouped.map(([category, items]) => (
        <section key={category} aria-label={category}>
          <div className="category-head">
            <h3>{category}</h3>
            <span className="category-count">{items.length}</span>
          </div>
          <div className="card-grid">
            {items.map((c) => (
              <ComponentCard key={c.name} component={c} />
            ))}
          </div>
        </section>
      ))}

      {query && !results.length && (
        <p className="empty">
          Nothing matches “{query}”. If you expected a component here, that gap is worth reporting —
          a failed search is the main reason duplicates get built.
        </p>
      )}

      <section className="section" style={{ marginTop: 'var(--ds-space-10)' }}>
        <h2>How this site works</h2>
        <p className="muted">
          Everything here is generated from <code>.design-system/registry.json</code>, built from the
          component source, the token files and the last test and lint runs. Props tables are extracted
          from the real TypeScript types; test and accessibility figures are measured results, not
          claims; card previews render the real components. The same registry generates{' '}
          <code>AGENTS.md</code> and <code>llms.txt</code>, so coding agents work from exactly the
          information on this page.
        </p>
        <pre className="code">
          <code>{`import { Button } from '${system.packageName ?? '@/design-system'}';

<Button variant="primary" onClick={save}>Save changes</Button>`}</code>
        </pre>
        <ul className="list">
          <li>
            Import from <code>{system.packageName ?? '@/design-system'}</code> — never a deep path.
          </li>
          <li>Style with semantic tokens only. Raw hex values and off-scale pixels are lint errors.</li>
          <li>Set <code>data-theme</code> on <code>&lt;html&gt;</code> so portalled content inherits it.</li>
        </ul>
      </section>
    </article>
  );
}

/**
 * The card preview is the component's first live example, rendered inert — an exhibit,
 * not a control. Where no examples file exists yet, the card says so rather than faking
 * a thumbnail: an illustration would drift; a live render cannot.
 */
function ComponentCard({ component }: { component: Component }) {
  const live = examplesFor(component.name);
  const first = component.examples[0];
  const exportName = first ? first.title.replace(/[^A-Za-z0-9]/g, '') : '';
  const Live = first ? (live[exportName] ?? live[`Example${exportName}`]) : undefined;

  return (
    <a className="card" href={`#/component/${component.name}`}>
      {/* inert (React 19+) keeps the specimen's buttons/inputs out of the tab order. */}
      <div className="card-stage" inert>
        {Live ? createElement(Live) : <span className="card-stage-empty">{component.name}</span>}
      </div>
      <div className="card-body">
        <span className="card-name">
          {component.name}
          <StatusDot status={component.status} />
        </span>
        <p className="card-summary">{component.summary}</p>
      </div>
    </a>
  );
}

export function Foundations({ theme }: { theme: string }) {
  const all = tokens.themes[theme] ?? {};
  const ramps = useMemo(() => {
    const map = new Map<string, [string, Token][]>();
    for (const [path, token] of Object.entries(all)) {
      const m = /^color\.([a-z]+)\.(\d+)$/.exec(path);
      if (m) map.set(m[1], [...(map.get(m[1]) ?? []), [path, token]]);
    }
    for (const [, steps] of map) steps.sort((a, b) => Number(a[0].split('.')[2]) - Number(b[0].split('.')[2]));
    return [...map.entries()];
  }, [all]);

  const typeRoles = useMemo(
    () => [...new Set(Object.keys(all).filter((p) => p.startsWith('type.')).map((p) => p.split('.')[1]))],
    [all],
  );
  const spacing = Object.entries(all).filter(([p]) => p.startsWith('space.'));
  const radii = Object.entries(all).filter(([p]) => p.startsWith('radius.'));
  const shadows = Object.entries(all).filter(([p]) => p.startsWith('shadow.'));
  const failing = tokens.contrast.filter((c) => c.theme === theme && !c.pass);

  return (
    <article className="page">
      <header className="page-head">
        <p className="eyebrow">Reference · generated</p>
        <h1>Foundations</h1>
        <p className="lede">The values everything else is built from, shown in the {theme} theme.</p>
      </header>

      <section className="section">
        <h2>Colour</h2>
        <p className="muted">
          Ramps are built in OKLCH so lightness is perceptual and one recipe works across every hue.
          Step 600 is the solid-fill step and is tuned so foreground text clears 4.5:1 on it.
        </p>
        {ramps.map(([name, steps]) => (
          <div key={name} className="ramp">
            <h3>{name}</h3>
            <div className="ramp-row">
              {steps.map(([path, token]) => (
                <div key={path} className="swatch" style={{ background: token.value }} title={`${path} · ${token.hex}`}>
                  <span className="swatch-step">{path.split('.')[2]}</span>
                </div>
              ))}
            </div>
          </div>
        ))}

        <h3>Measured contrast</h3>
        <p className="muted">
          Every foreground/background pair, checked at build time. A failing pair fails the build —
          contrast as a CI gate rather than a review comment is what makes it impossible to merge.
        </p>
        {failing.length > 0 && (
          <div className="callout callout-danger">
            <strong>{failing.length} failing pair(s) in this theme.</strong>
          </div>
        )}
        <div className="table-scroll">
          <table className="table">
            <thead>
              <tr>
                <th scope="col">Foreground</th>
                <th scope="col">Background</th>
                <th scope="col">Ratio</th>
                <th scope="col">Required</th>
              </tr>
            </thead>
            <tbody>
              {tokens.contrast
                .filter((c) => c.theme === theme)
                .map((c) => (
                  <tr key={`${c.fg}-${c.bg}`}>
                    <td>
                      <code>{c.fg}</code>
                    </td>
                    <td>
                      <code>{c.bg}</code>
                    </td>
                    <td className={c.pass ? 'ok' : 'no'}>{c.ratio}:1</td>
                    <td className="muted">{c.min}:1</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="section">
        <h2>Type</h2>
        <p className="muted">
          Named by role, never by size. Each token is a full set — size, line height, weight and
          tracking — so line heights cannot drift apart across the product.
        </p>
        {typeRoles.map((role) => (
          <div key={role} className="type-row">
            <span className="type-label">type.{role}</span>
            <p
              style={{
                fontSize: `var(--ds-type-${role}-font-size)`,
                lineHeight: `var(--ds-type-${role}-line-height)`,
                fontWeight: `var(--ds-type-${role}-font-weight)` as never,
                letterSpacing: `var(--ds-type-${role}-letter-spacing)`,
                fontFamily: `var(--ds-type-${role}-font-family)`,
                margin: 0,
              }}
            >
              The quick brown fox jumps over the lazy dog
            </p>
          </div>
        ))}
      </section>

      <section className="section">
        <h2>Spacing</h2>
        <p className="muted">
          A 4px grid with deliberate gaps. The missing rungs are what stop people fine-tuning their
          way out of the system.
        </p>
        {spacing.map(([path, token]) => (
          <div key={path} className="space-row">
            <span className="type-label">{path}</span>
            <span className="space-bar" style={{ width: token.value }} />
            <span className="muted mono-sm">{token.value}</span>
          </div>
        ))}
      </section>

      <section className="section">
        <h2>Radius</h2>
        <div className="specimen-row">
          {radii.map(([path, token]) => (
            <div key={path} className="specimen">
              <div className="specimen-box" style={{ borderRadius: token.value }} />
              <span className="mono-sm">{path.split('.')[1]}</span>
            </div>
          ))}
        </div>
        <p className="muted">
          Nested radii must differ: <code>inner = outer − padding</code>, or the curves look wrong.
        </p>
      </section>

      <section className="section">
        <h2>Elevation</h2>
        <div className="specimen-row">
          {shadows.map(([path, token]) => (
            <div key={path} className="specimen">
              <div className="specimen-box elevated" style={{ boxShadow: token.value }} />
              <span className="mono-sm">{path.split('.')[1]}</span>
            </div>
          ))}
        </div>
        <p className="muted">
          Each level is a pair — a tight contact shadow plus a diffuse ambient one. In dark themes
          elevation is carried by surface lightness instead, because shadow on near-black is invisible.
        </p>
      </section>

      <section className="section">
        <h2>Motion</h2>
        <MotionSpecimens all={all} />
      </section>
    </article>
  );
}

function MotionSpecimens({ all }: { all: Record<string, Token> }) {
  const [playing, setPlaying] = useState(0);
  const durations = Object.entries(all).filter(([p]) => p.startsWith('duration.'));
  const easings = Object.entries(all).filter(([p]) => p.startsWith('easing.'));

  return (
    <>
      <p className="muted">
        Exits run about 0.8× the entrance — a user who dismissed something has already moved on.
        Anything above 400ms feels broken unless the user asked for it.
      </p>
      <button type="button" onClick={() => setPlaying((n) => n + 1)}>
        Play
      </button>
      {easings.map(([easePath, ease]) => (
        <div key={easePath} className="motion-row">
          <span className="type-label">{easePath}</span>
          <span
            key={`${easePath}-${playing}`}
            className="motion-dot"
            style={{ animationTimingFunction: ease.value, animationDuration: 'var(--ds-duration-slow)' }}
          />
        </div>
      ))}
      <ul className="list mono-sm">
        {durations.map(([path, token]) => (
          <li key={path}>
            {path} — {token.value}
            {token.description ? ` · ${token.description}` : ''}
          </li>
        ))}
      </ul>
    </>
  );
}

export function TokenExplorer({ theme }: { theme: string }) {
  const [query, setQuery] = useState(() => new URLSearchParams(location.hash.split('?')[1] ?? '').get('q') ?? '');
  const [tier, setTier] = useState<'all' | 'primitive' | 'semantic' | 'component'>('all');
  const [copied, setCopied] = useState<string | null>(null);

  const rows = useMemo(
    () => searchTokens(query, theme).filter(([, t]) => tier === 'all' || t.tier === tier),
    [query, theme, tier],
  );

  const copy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(text);
    setTimeout(() => setCopied(null), 1200);
  };

  return (
    <article className="page">
      <header className="page-head">
        <p className="eyebrow">Reference · generated</p>
        <h1>Tokens</h1>
        <p className="lede">
          {rows.length} of {Object.keys(tokens.themes[theme] ?? {}).length} tokens in the {theme} theme.
        </p>
        <p className="muted">
          Components may only consume the <strong>semantic</strong> and <strong>component</strong>{' '}
          tiers. A component referencing a primitive cannot be re-themed — that is a lint error, not
          a style preference.
        </p>
      </header>

      <div className="toolbar">
        <input
          className="search"
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Filter tokens"
          aria-label="Filter tokens"
        />
        <div role="group" aria-label="Filter by tier" className="segmented">
          {(['all', 'primitive', 'semantic', 'component'] as const).map((t) => (
            <button key={t} type="button" aria-pressed={tier === t} onClick={() => setTier(t)}>
              {t}
            </button>
          ))}
        </div>
      </div>

      <div className="table-scroll">
        <table className="table">
          <thead>
            <tr>
              <th scope="col" />
              <th scope="col">Token</th>
              <th scope="col">Value</th>
              <th scope="col">Tier</th>
              <th scope="col">Used by</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(([path, token]) => (
              <tr key={path}>
                <td>
                  {token.type === 'color' ? (
                    <span className="swatch-sm" style={{ background: token.value }} />
                  ) : null}
                </td>
                <td>
                  <button type="button" className="copy-btn" onClick={() => copy(path)} title="Copy token name">
                    <code>{path}</code>
                  </button>
                  {token.description && <p className="muted mono-sm">{token.description}</p>}
                </td>
                <td>
                  <button type="button" className="copy-btn" onClick={() => copy(token.var)} title="Copy var()">
                    <code>{copied === token.var ? 'copied' : token.value}</code>
                  </button>
                </td>
                <td>
                  <span className={`pill pill-${token.tier}`}>{token.tier}</span>
                </td>
                <td className="mono-sm muted">{consumersOf(path).map((c) => c.name).join(', ') || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </article>
  );
}

export function Patterns() {
  return (
    <article className="page">
      <header className="page-head">
        <p className="eyebrow">Guidance · authored</p>
        <h1>Patterns</h1>
        <p className="lede">Decisions that span more than one component, written down once.</p>
        <p className="muted">
          Unlike every other page here, this one is <strong>authored, not generated</strong> — starter
          guidance the team edits directly (in <code>src/pages.tsx</code>) as its conventions form.
        </p>
      </header>

      <section className="section">
        <h2>Forms</h2>
        <ul className="list">
          <li>
            Every input gets a visible label. A placeholder-as-label disappears the moment someone
            types.
          </li>
          <li>
            <code>TextField</code> already wires label, description and error to the input via{' '}
            <code>aria-describedby</code> — compose fields from it rather than re-plumbing that per
            form.
          </li>
          <li>
            Validate format errors on <strong>blur</strong> and everything else on{' '}
            <strong>submit</strong>. Validating per keystroke tells the user they are wrong while
            they are still typing the right answer.
          </li>
          <li>
            After a failed submit, move focus to the first invalid field and keep the error text
            until the value changes.
          </li>
        </ul>
      </section>

      <section className="section">
        <h2>Empty states</h2>
        <p className="muted">
          There are three kinds, and they need different messages — one generic “Nothing here”
          serves none of them.
        </p>
        <ul className="list">
          <li>
            <strong>First use</strong> — nothing exists yet. Explain what will live here and lead
            with the create action.
          </li>
          <li>
            <strong>Cleared</strong> — the user finished the work (inbox zero). Acknowledge it;
            don’t prompt them to make more work.
          </li>
          <li>
            <strong>No results</strong> — a search or filter matched nothing. Echo what was searched
            and offer to clear it; never imply the data doesn’t exist.
          </li>
        </ul>
      </section>

      <section className="section">
        <h2>Errors</h2>
        <ul className="list">
          <li>
            <strong>Field-level</strong> for anything the user can fix in place — attached to the
            field, announced through the field’s description wiring.
          </li>
          <li>
            <strong>Page-level</strong> (a banner) only when the problem is not attributable to one
            field: the save failed, the session expired, the service is down.
          </li>
          <li>
            Every error offers a recovery action — retry, edit, or where to get help. An error the
            user can only stare at is a dead end.
          </li>
          <li>Keep the user’s input. An error that also empties the form punishes twice.</li>
        </ul>
      </section>

      <section className="section">
        <h2>Loading</h2>
        <ul className="list">
          <li>
            <strong>Skeleton</strong> when the shape of the incoming content is known (a table, a
            card grid) — it reserves layout. <strong>Spinner</strong> only when it is not (a search,
            a computation).
          </li>
          <li>
            Loaded content must land in the space the skeleton reserved. If the layout shifts on
            arrival, the skeleton lied.
          </li>
          <li>Under ~300ms, show nothing — a flash of spinner reads slower than a brief wait.</li>
          <li>
            An in-flight action indicates on its triggering control (<code>loading</code> on the
            Button), not on the whole page.
          </li>
        </ul>
      </section>
    </article>
  );
}

export function Content() {
  return (
    <article className="page">
      <header className="page-head">
        <p className="eyebrow">Guidance · authored</p>
        <h1>Content</h1>
        <p className="lede">How the product talks — voice, labels, errors and terminology.</p>
        <p className="muted">
          Like Patterns, this page is <strong>authored, not generated</strong> — a starter the team
          edits directly (in <code>src/pages.tsx</code>).
        </p>
      </header>

      <section className="section">
        <h2>Voice</h2>
        <ul className="list">
          <li>Plain over clever. A sentence that needs re-reading failed.</li>
          <li>
            Address the user as “you”. The product says “we” only for things it did — “We couldn’t
            save your changes”.
          </li>
          <li>
            Front-load the point: the first few words are all that survive a truncated string, a
            notification, or a screen reader’s listing.
          </li>
        </ul>
      </section>

      <section className="section">
        <h2>Action labels</h2>
        <div className="dodont">
          <div className="dodont-cell ok">
            <span className="dodont-label">Do</span>
            <p>Name the action: “Delete project”, “Save changes”, “Invite teammate”</p>
          </div>
          <div className="dodont-cell no">
            <span className="dodont-label">Don’t</span>
            <p>Name the mechanism: “OK”, “Submit”, “Yes”, “Click here”</p>
          </div>
          <p className="dodont-why">
            Screen-reader users pull up buttons as a list, out of context — nine buttons called “OK”
            are nine identical entries. Verb + object also makes destructive confirms self-describing.
          </p>
        </div>
      </section>

      <section className="section">
        <h2>Error messages</h2>
        <p>
          Every error message is <strong>what happened + how to fix it</strong>, in that order. No
          blame (“you entered an invalid…”), no jargon (error codes, exception names), no dead ends.
        </p>
        <div className="dodont">
          <div className="dodont-cell ok">
            <span className="dodont-label">Do</span>
            <p>“That file is over 10 MB. Compress it or choose a smaller one.”</p>
          </div>
          <div className="dodont-cell no">
            <span className="dodont-label">Don’t</span>
            <p>“Invalid input.” · “Error 422: Unprocessable entity.”</p>
          </div>
        </div>
      </section>

      <section className="section">
        <h2>Terminology</h2>
        <p className="muted">
          One name per concept, everywhere — this table is the arbiter when two features disagree.
          Sentence case for everything: headings, buttons, labels, menu items.
        </p>
        <div className="table-scroll">
          <table className="table">
            <thead>
              <tr>
                <th scope="col">Use</th>
                <th scope="col">Not</th>
                <th scope="col">Notes</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Delete</td>
                <td>Remove, erase</td>
                <td>“Remove” only for taking an item out of a collection that still exists elsewhere</td>
              </tr>
              <tr>
                <td>Sign in / sign out</td>
                <td>Log in, login</td>
                <td>“Login” is a noun, not a verb</td>
              </tr>
              <tr>
                <td className="muted" colSpan={3}>
                  Add your product’s nouns here — this stub existing is the point of the page.
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </article>
  );
}

export function StatusBoard() {
  const rows = registry.components;
  return (
    <article className="page">
      <header className="page-head">
        <p className="eyebrow">Reference · generated</p>
        <h1>Status board</h1>
        <p className="lede">The whole library in one table — what is solid, what needs work, what is used.</p>
        <p className="muted">
          This is the page to open when deciding what to invest in next. It turns “we should improve
          the design system” into a ranked list.
        </p>
      </header>

      <div className="table-scroll">
        <table className="table">
          <thead>
            <tr>
              <th scope="col">Component</th>
              <th scope="col">Status</th>
              <th scope="col">Tests</th>
              <th scope="col">Keyboard</th>
              <th scope="col">axe</th>
              <th scope="col">Lint</th>
              <th scope="col">Guidance</th>
              <th scope="col">Usages</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((c) => {
              const guidance = c.doDont.length > 0 && c.examples.length > 0 && c.summary;
              return (
                <tr key={c.name}>
                  <td>
                    <a href={`#/component/${c.name}`}>{c.name}</a>
                  </td>
                  <td>
                    <StatusDot status={c.status} /> {c.status}
                  </td>
                  <td className={c.tests ? (c.tests.failing ? 'no' : 'ok') : 'muted'}>
                    {c.tests ? `${c.tests.passing}/${c.tests.total}` : '—'}
                  </td>
                  <td className={c.tests?.hasKeyboardTests ? 'ok' : 'no'}>
                    {c.tests?.hasKeyboardTests ? 'yes' : 'no'}
                  </td>
                  <td className={c.a11y.axeStatus === 'pass' ? 'ok' : c.a11y.axeStatus === 'fail' ? 'no' : 'muted'}>
                    {c.a11y.axeStatus}
                  </td>
                  <td className={c.lint ? (c.lint.errors ? 'no' : 'ok') : 'muted'}>
                    {c.lint ? `${c.lint.errors}e/${c.lint.warnings}w` : '—'}
                  </td>
                  <td className={guidance ? 'ok' : 'no'}>{guidance ? 'complete' : 'incomplete'}</td>
                  <td>{c.adoption.usages}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </article>
  );
}
