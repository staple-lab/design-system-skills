import { createElement, useState } from 'react';
import { StatusDot } from './App';
import { examplesFor, registry, type Component, type Prop } from './data';

export function ComponentPage({ name }: { name: string }) {
  const component = registry.components.find((c) => c.name === name);
  if (!component) return <p className="empty">No component called “{name}”.</p>;

  const live = examplesFor(name);

  return (
    <article className="page">
      <header className="page-head">
        <p className="eyebrow">{component.category}</p>
        <div className="page-title-row">
          <h1>{component.name}</h1>
          <span className={`badge badge-${component.status}`}>
            <StatusDot status={component.status} />
            {component.status}
          </span>
          {component.since && <span className="muted">since v{component.since}</span>}
        </div>
        <p className="lede">{component.summary}</p>
        {component.description && <p className="muted">{component.description}</p>}

        {component.deprecation && (
          <div className="callout callout-danger" role="note">
            <strong>Deprecated.</strong> Use <code>{component.deprecation.replacedBy}</code> instead.
            {component.deprecation.removeIn && <> Removed in {component.deprecation.removeIn}.</>}
            {component.deprecation.migration && <p className="mono-sm">{component.deprecation.migration}</p>}
          </div>
        )}

        <QualityStrip component={component} />
      </header>

      {(component.useFor.length > 0 || component.dontUseFor.length > 0) && (
        <Section title="When to use it">
          <div className="two-col">
            <div>
              <h3 className="ok">Use for</h3>
              <ul className="list">
                {component.useFor.map((x) => (
                  <li key={x}>{x}</li>
                ))}
              </ul>
            </div>
            <div>
              <h3 className="no">Don’t use for</h3>
              <ul className="list">
                {component.dontUseFor.map((x) => (
                  <li key={x}>{x}</li>
                ))}
              </ul>
            </div>
          </div>
        </Section>
      )}

      {component.examples.length > 0 && (
        <Section title="Examples">
          {component.examples.map((example) => {
            // Live render when a <Name>.examples.tsx exports a matching component.
            const exportName = example.title.replace(/[^A-Za-z0-9]/g, '');
            const Live = live[exportName] ?? live[`Example${exportName}`];
            return (
              <Example
                key={example.title}
                title={example.title}
                description={example.description}
                code={example.code}
                preview={Live ? createElement(Live) : null}
              />
            );
          })}
        </Section>
      )}

      {component.parts.length > 0 && (
        <Section title="Anatomy" hint="The named parts of the component, in the order they compose.">
          <ul className="list">
            {component.parts.map((p) => (
              <li key={p.name}>
                <code>{p.name}</code>
                {p.required && <span className="pill">required</span>} — {p.description}
              </li>
            ))}
          </ul>
        </Section>
      )}

      <Section
        title="Props"
        hint={
          component.propsExtendNative
            ? `Also accepts every native <${component.propsExtendNative}> prop, including ref, aria-* and data-*.`
            : undefined
        }
      >
        <PropsTable props={component.props} />
      </Section>

      {component.keyboard.length > 0 && (
        <Section title="Keyboard">
          <table className="table">
            <thead>
              <tr>
                <th scope="col">Key</th>
                <th scope="col">Action</th>
              </tr>
            </thead>
            <tbody>
              {component.keyboard.map((k) => (
                <tr key={k.keys}>
                  <td>
                    <kbd>{k.keys}</kbd>
                  </td>
                  <td>{k.action}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Section>
      )}

      {(component.a11y.provides?.length || component.a11y.consumerMustProvide?.length) && (
        <Section title="Accessibility">
          {component.a11y.role && (
            <p className="muted">
              Role: <code>{component.a11y.role}</code>
            </p>
          )}
          {component.a11y.provides?.length ? (
            <>
              <h3>Handled for you</h3>
              <ul className="list">
                {component.a11y.provides.map((x) => (
                  <li key={x}>{x}</li>
                ))}
              </ul>
            </>
          ) : null}
          {component.a11y.consumerMustProvide?.length ? (
            <>
              <h3>You still have to provide</h3>
              <ul className="list">
                {component.a11y.consumerMustProvide.map((x) => (
                  <li key={x}>{x}</li>
                ))}
              </ul>
            </>
          ) : null}
          {component.a11y.limitations?.length ? (
            <div className="callout callout-warning">
              <strong>Known limitations.</strong>
              <ul className="list">
                {component.a11y.limitations.map((x) => (
                  <li key={x}>{x}</li>
                ))}
              </ul>
            </div>
          ) : null}
        </Section>
      )}

      {component.doDont.length > 0 && (
        <Section title="Do and don’t">
          {component.doDont.map((pair) => (
            <div key={pair.do} className="dodont">
              <div className="dodont-cell ok">
                <span className="dodont-label">Do</span>
                <p>{pair.do}</p>
              </div>
              <div className="dodont-cell no">
                <span className="dodont-label">Don’t</span>
                <p>{pair.dont}</p>
              </div>
              {pair.why && <p className="dodont-why">{pair.why}</p>}
            </div>
          ))}
        </Section>
      )}

      {component.tokens.length > 0 && (
        <Section
          title="Tokens consumed"
          hint="Change one of these and this component changes. That makes impact analysis a lookup rather than a guess."
        >
          <ul className="token-chips">
            {component.tokens.map((t) => (
              <li key={t}>
                <a className="chip" href={`#/tokens?q=${encodeURIComponent(t)}`}>
                  {t}
                </a>
              </li>
            ))}
          </ul>
          {component.unknownTokens?.length ? (
            <div className="callout callout-danger">
              <strong>Unknown token references.</strong> These resolve to nothing at runtime and
              fail silently: {component.unknownTokens.join(', ')}
            </div>
          ) : null}
        </Section>
      )}

      <Section title="Adoption">
        <p>
          Used in <strong>{component.adoption.usages}</strong> file
          {component.adoption.usages === 1 ? '' : 's'}.
        </p>
        {component.adoption.shadowImplementations.length > 0 && (
          <div className="callout callout-warning">
            <strong>Hand-rolled equivalents still in the product</strong> — the real adoption cost:
            <ul className="list">
              {component.adoption.shadowImplementations.map((f) => (
                <li key={f}>
                  <code>{f}</code>
                </li>
              ))}
            </ul>
          </div>
        )}
        <details>
          <summary>Where it is used</summary>
          <ul className="list mono-sm">
            {component.adoption.files.map((f) => (
              <li key={f}>{f}</li>
            ))}
          </ul>
        </details>
        <p className="muted mono-sm">
          Source: <code>{component.sourcePath}</code>
        </p>
      </Section>

      {component.related.length > 0 && (
        <Section title="Related">
          <ul className="token-chips">
            {component.related.map((r) => (
              <li key={r}>
                <a className="chip" href={`#/component/${r}`}>
                  {r}
                </a>
              </li>
            ))}
          </ul>
        </Section>
      )}
    </article>
  );
}

/** Test, a11y and lint status as MEASURED numbers. A claim would be worth nothing here. */
function QualityStrip({ component }: { component: Component }) {
  const { tests, lint, bundle } = component;
  return (
    <dl className="quality">
      <Stat
        label="Tests"
        value={tests ? `${tests.passing}/${tests.total}` : '—'}
        tone={!tests ? 'unknown' : tests.failing > 0 ? 'bad' : 'good'}
        hint={tests ? undefined : 'No test results — run the suite, then rebuild the registry'}
      />
      <Stat
        label="Keyboard"
        value={tests?.hasKeyboardTests ? 'tested' : 'untested'}
        tone={tests?.hasKeyboardTests ? 'good' : 'bad'}
      />
      <Stat
        label="axe"
        value={component.a11y.axeStatus ?? 'unknown'}
        tone={
          component.a11y.axeStatus === 'pass' ? 'good' : component.a11y.axeStatus === 'fail' ? 'bad' : 'unknown'
        }
        hint="axe catches ~30–40% of WCAG issues. Green here is a floor, not a pass."
      />
      <Stat
        label="Lint"
        value={lint ? `${lint.errors}e / ${lint.warnings}w` : '—'}
        tone={!lint ? 'unknown' : lint.errors > 0 ? 'bad' : 'good'}
      />
      {bundle?.gzip != null && <Stat label="Size" value={`${(bundle.gzip / 1024).toFixed(1)}kB`} tone="unknown" />}
    </dl>
  );
}

function Stat({ label, value, tone, hint }: { label: string; value: string; tone: string; hint?: string }) {
  return (
    <div className={`stat stat-${tone}`} title={hint}>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function PropsTable({ props }: { props: Prop[] }) {
  if (!props.length) {
    return (
      <p className="muted">
        No props extracted. Check that the component exports a <code>{'<Name>Props'}</code> type.
      </p>
    );
  }
  return (
    <div className="table-scroll">
      <table className="table">
        <thead>
          <tr>
            <th scope="col">Prop</th>
            <th scope="col">Type</th>
            <th scope="col">Default</th>
            <th scope="col">Description</th>
          </tr>
        </thead>
        <tbody>
          {props.map((p) => (
            <tr key={p.name} className={p.deprecated ? 'row-deprecated' : undefined}>
              <td>
                <code className="prop-name">{p.name}</code>
                {p.required && <span className="pill pill-required">required</span>}
                {p.deprecated && <span className="pill pill-deprecated">deprecated</span>}
              </td>
              <td>
                <code className="prop-type">{p.type}</code>
              </td>
              <td>{p.default ? <code>{p.default}</code> : <span className="muted">—</span>}</td>
              <td>
                {p.description || <span className="muted">—</span>}
                {p.deprecated && <p className="mono-sm">{p.deprecated}</p>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Example({
  title,
  description,
  code,
  preview,
}: {
  title: string;
  description?: string;
  code: string;
  preview: React.ReactNode;
}) {
  const [showCode, setShowCode] = useState(!preview);
  const [copied, setCopied] = useState(false);

  return (
    <figure className="example">
      <figcaption>
        <h3>{title}</h3>
        {description && <p className="muted">{description}</p>}
      </figcaption>

      {preview ? (
        <div className="example-preview">{preview}</div>
      ) : (
        <p className="example-note">
          Code only — add <code>{'<Name>.examples.tsx'}</code> next to the component to render it live.
        </p>
      )}

      <div className="example-actions">
        {preview && (
          <button type="button" onClick={() => setShowCode((v) => !v)} aria-expanded={showCode}>
            {showCode ? 'Hide code' : 'Show code'}
          </button>
        )}
        <button
          type="button"
          onClick={() => {
            navigator.clipboard.writeText(code);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
        >
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>

      {showCode && (
        <pre className="code">
          <code>{code}</code>
        </pre>
      )}
    </figure>
  );
}

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  const id = title.toLowerCase().replace(/[^a-z]+/g, '-');
  return (
    <section className="section" aria-labelledby={id}>
      <h2 id={id}>{title}</h2>
      {hint && <p className="muted">{hint}</p>}
      {children}
    </section>
  );
}
