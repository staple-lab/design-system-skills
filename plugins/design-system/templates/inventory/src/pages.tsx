import { useMemo, useState } from 'react';
import { StatusDot } from './App';
import { consumersOf, registry, searchTokens, tokens, type Token } from './data';

export function Overview() {
  const { system, counts } = registry;
  return (
    <article className="page">
      <header className="page-head">
        <h1>{system.name}</h1>
        <p className="lede">
          {counts.total} components on {system.primitives}, styled with {system.cssSystem}
          {system.motion !== 'none' && `, animated with ${system.motion}`}.
        </p>
      </header>

      <section className="section">
        <h2>Library</h2>
        <dl className="quality">
          {Object.entries(counts.byStatus).map(([status, n]) => (
            <div key={status} className="stat">
              <dt>{status}</dt>
              <dd>{n}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="section">
        <h2>How this site works</h2>
        <p>
          Everything here is generated from <code>.design-system/registry.json</code>, which is built
          from the component source, the token files and the last test and lint runs. Props tables are
          extracted from the real TypeScript types, so they cannot be out of date; test and
          accessibility figures are the measured results, not claims.
        </p>
        <p className="muted">
          The same registry generates <code>AGENTS.md</code>, so coding agents work from exactly the
          information on this page.
        </p>
      </section>

      <section className="section">
        <h2>Getting started</h2>
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

export function StatusBoard() {
  const rows = registry.components;
  return (
    <article className="page">
      <header className="page-head">
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
