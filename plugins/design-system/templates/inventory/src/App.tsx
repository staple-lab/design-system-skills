import { useEffect, useMemo, useRef, useState } from 'react';
import { categories, registry, search, themeNames } from './data';
import { ComponentPage } from './ComponentPage';
import { Content, Foundations, Overview, Patterns, StatusBoard, TokenExplorer } from './pages';

type Route =
  | { page: 'overview' | 'foundations' | 'tokens' | 'patterns' | 'content' | 'status' }
  | { page: 'component'; name: string };

function parseHash(): Route {
  const hash = location.hash.replace(/^#\/?/, '');
  if (!hash) return { page: 'overview' };
  const [section, name] = hash.split('/');
  if (section === 'component' && name) return { page: 'component', name: decodeURIComponent(name) };
  if (['foundations', 'tokens', 'patterns', 'content', 'status'].includes(section)) return { page: section as 'foundations' };
  return { page: 'overview' };
}

export function App() {
  const [route, setRoute] = useState<Route>(parseHash);
  const [query, setQuery] = useState('');
  // Seeded from the inline script in index.html, which already ran before first paint.
  const [theme, setTheme] = useState(() => document.documentElement.dataset.theme ?? themeNames[0] ?? 'light');
  const [density, setDensity] = useState<'comfortable' | 'compact'>('comfortable');
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onHash = () => {
      setRoute(parseHash());
      window.scrollTo(0, 0);
    };
    addEventListener('hashchange', onHash);
    return () => removeEventListener('hashchange', onHash);
  }, []);

  // The theme attribute goes on <html>, not on a wrapper: portalled content (menus,
  // dialogs, tooltips) renders at the document root and would otherwise miss the theme.
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.dataset.density = density;
    localStorage.setItem('ds-theme', theme);
  }, [theme, density]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.key === '/' || (e.key === 'k' && (e.metaKey || e.ctrlKey))) && document.activeElement !== searchRef.current) {
        e.preventDefault();
        searchRef.current?.focus();
      }
      if (e.key === 'Escape' && document.activeElement === searchRef.current) {
        setQuery('');
        searchRef.current?.blur();
      }
    };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, []);

  const results = useMemo(() => search(query), [query]);
  const grouped = useMemo(() => {
    const map = new Map<string, typeof results>();
    for (const c of results) map.set(c.category, [...(map.get(c.category) ?? []), c]);
    return [...map.entries()].sort(([a], [b]) => categories.indexOf(a) - categories.indexOf(b));
  }, [results]);

  return (
    <div className="shell">
      <a href="#main" className="skip-link">
        Skip to content
      </a>

      <header className="topbar">
        <a href="#/" className="wordmark">
          {registry.system.name}
          <span className="version">v{registry.system.version}</span>
        </a>

        <div className="search-wrap">
          <input
            ref={searchRef}
            className="search"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search components, props, tokens"
            aria-label="Search the design system"
          />
          <kbd className="search-kbd" aria-hidden="true">
            ⌘K
          </kbd>
        </div>

        <div className="topbar-controls">
          <label className="control">
            <span>Theme</span>
            <select value={theme} onChange={(e) => setTheme(e.target.value)}>
              {themeNames.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </label>
          <label className="control">
            <span>Density</span>
            <select value={density} onChange={(e) => setDensity(e.target.value as 'compact')}>
              <option value="comfortable">comfortable</option>
              <option value="compact">compact</option>
            </select>
          </label>
        </div>
      </header>

      <div className="body">
        <aside className="sidebar">
          <nav aria-label="Design system">
            <ul className="nav">
              <NavItem active={route.page === 'overview'} href="#/">Overview</NavItem>
              <NavItem active={route.page === 'foundations'} href="#/foundations">Foundations</NavItem>
              <NavItem active={route.page === 'tokens'} href="#/tokens">Tokens</NavItem>
              <NavItem active={route.page === 'patterns'} href="#/patterns">Patterns</NavItem>
              <NavItem active={route.page === 'content'} href="#/content">Content</NavItem>
              <NavItem active={route.page === 'status'} href="#/status">Status board</NavItem>
            </ul>

            {grouped.map(([category, items]) => (
              <div key={category} className="nav-group">
                <h2 className="nav-heading">
                  {category}
                  <span className="nav-count">{items.length}</span>
                </h2>
                <ul className="nav">
                  {items.map((c) => (
                    <NavItem
                      key={c.name}
                      href={`#/component/${c.name}`}
                      active={route.page === 'component' && route.name === c.name}
                    >
                      {c.name}
                      <StatusDot status={c.status} />
                    </NavItem>
                  ))}
                </ul>
              </div>
            ))}

            {query && !results.length && (
              <p className="empty">
                Nothing matches “{query}”. If you expected a component here, that gap is worth
                reporting — a failed search is the main reason duplicates get built.
              </p>
            )}
          </nav>
        </aside>

        <main id="main" className="main" tabIndex={-1}>
          {route.page === 'overview' && <Overview results={results} query={query} />}
          {route.page === 'foundations' && <Foundations theme={theme} />}
          {route.page === 'tokens' && <TokenExplorer theme={theme} />}
          {route.page === 'patterns' && <Patterns />}
          {route.page === 'content' && <Content />}
          {route.page === 'status' && <StatusBoard />}
          {route.page === 'component' && <ComponentPage name={route.name} />}
        </main>
      </div>
    </div>
  );
}

function NavItem({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return (
    <li>
      <a href={href} className="nav-link" aria-current={active ? 'page' : undefined}>
        {children}
      </a>
    </li>
  );
}

export function StatusDot({ status }: { status: string }) {
  return <span className={`dot dot-${status}`} title={status} aria-label={status} />;
}
