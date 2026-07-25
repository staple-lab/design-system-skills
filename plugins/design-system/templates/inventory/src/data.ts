import registryJson from '../../.design-system/registry.json';
import tokensJson from '../../tokens/dist/tokens.json';

/**
 * The inventory renders the registry. It does not restate it.
 *
 * If a fact appears on this site but not in registry.json, it was authored in the wrong
 * place — move it to the component's .meta.json or the token source, and let the build
 * put it here. That constraint is the only reason these docs cannot drift.
 */

export interface Prop {
  name: string;
  type: string;
  default: string | null;
  required: boolean;
  description: string;
  deprecated: string | null;
  source?: string;
}

export interface Component {
  name: string;
  status: 'draft' | 'beta' | 'stable' | 'deprecated';
  since: string | null;
  category: string;
  summary: string;
  description: string;
  synonyms: string[];
  useFor: string[];
  dontUseFor: string[];
  sourcePath: string;
  parts: { name: string; required?: boolean; description?: string }[];
  props: Prop[];
  propsExtendNative: string | null;
  keyboard: { keys: string; action: string }[];
  a11y: {
    role?: string;
    provides?: string[];
    consumerMustProvide?: string[];
    limitations?: string[];
    axeStatus?: 'pass' | 'fail' | 'unknown';
  };
  doDont: { do: string; dont: string; why?: string }[];
  examples: { title: string; description?: string; code: string }[];
  tokens: string[];
  unknownTokens?: string[];
  tests: {
    total: number;
    passing: number;
    failing: number;
    coverage: number | null;
    hasKeyboardTests: boolean;
    hasAxeTests: boolean;
  } | null;
  lint: { errors: number; warnings: number } | null;
  bundle: { gzip: number | null; raw: number | null } | null;
  adoption: { usages: number; files: string[]; shadowImplementations: string[] };
  deprecation: { replacedBy: string; removeIn?: string; migration?: string } | null;
  related: string[];
}

export interface Registry {
  system: {
    name: string;
    version: string;
    packageName: string | null;
    primitives: string;
    cssSystem: string;
    motion: string;
  };
  counts: { total: number; byStatus: Record<string, number> };
  components: Component[];
}

export interface Token {
  value: string;
  type: string;
  tier: 'primitive' | 'semantic' | 'component';
  description?: string;
  var: string;
  hex?: string;
  partOf?: string;
}

export interface TokenFile {
  themes: Record<string, Record<string, Token>>;
  contrast: { theme: string; fg: string; bg: string; ratio: number; min: number; pass: boolean }[];
}

export const registry = registryJson as unknown as Registry;
export const tokens = tokensJson as unknown as TokenFile;
export const themeNames = Object.keys(tokens.themes);

/**
 * Live examples come from an optional `<Name>.examples.tsx` next to the component.
 * Where one exists the site renders the real component; where it does not, the code
 * block from the meta file is still shown. Never fake a rendered example — a screenshot
 * that has drifted from the component is worse than no example at all.
 */
const exampleModules = import.meta.glob('../../src/design-system/components/*/*.examples.tsx', {
  eager: true,
}) as Record<string, Record<string, React.ComponentType>>;

export function examplesFor(componentName: string): Record<string, React.ComponentType> {
  const key = Object.keys(exampleModules).find((p) => p.includes(`/${componentName}/`));
  return key ? exampleModules[key] : {};
}

export const categories = [...new Set(registry.components.map((c) => c.category))].sort();

export function search(query: string): Component[] {
  const q = query.trim().toLowerCase();
  if (!q) return registry.components;
  return registry.components.filter((c) =>
    [
      c.name,
      c.summary,
      c.category,
      ...c.synonyms, // "dropdown" must find Select — failed search is why duplicates get built
      ...c.props.map((p) => p.name),
      ...c.useFor,
    ]
      .join(' ')
      .toLowerCase()
      .includes(q),
  );
}

export function searchTokens(query: string, theme: string): [string, Token][] {
  const entries = Object.entries(tokens.themes[theme] ?? {});
  const q = query.trim().toLowerCase();
  if (!q) return entries;
  return entries.filter(
    ([path, t]) =>
      path.toLowerCase().includes(q) ||
      t.value.toLowerCase().includes(q) ||
      (t.description ?? '').toLowerCase().includes(q),
  );
}

/** Which components consume this token — the "what breaks if I change this" lookup. */
export function consumersOf(tokenPath: string): Component[] {
  return registry.components.filter((c) => c.tokens.includes(tokenPath));
}
