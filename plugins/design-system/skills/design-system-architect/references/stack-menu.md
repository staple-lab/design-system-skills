# The full stack menu

The interview offers four options per question because that is what fits. This is everything behind "Other". Current as of **July 2026** — verify versions with `npm view <pkg> version` before you install, and prefer the repo's existing choice over anything here.

The four questions are not independent — several component-layer picks contain a primitives answer or require a CSS-system answer. `stack-constraints.md` (next to this file) is the resolver: apply it after the interview, before writing the brief.

---

## 1. Headless primitive layer

The layer that owns behaviour and accessibility and ships no styles. **Pick one and only one.** Mixing two primitive libraries means two focus-management philosophies fighting in the same portal.

| Library | Package | Take |
|---|---|---|
| **Base UI** | `@base-ui/react` | MUI's headless library; stable 1.x since Dec 2025. Designed with the benefit of Radix's lessons: a `render` prop instead of `asChild`, more consistent state/data-attribute conventions, active full-time maintenance. shadcn's CLI defaults new projects to it. Note the package rename from `@base-ui-components/react` — old tutorials use the dead name. **Default recommendation for new systems.** |
| **Radix Primitives** | `@radix-ui/react-*` | The incumbent. Biggest ecosystem, most Stack Overflow answers, most AI training data, `asChild` composition. Per-component packages keep installs small. Maintenance has been slower than Base UI's. Recommend it when the repo already uses it or when the team wants the widest pool of examples. |
| **React Aria Components** | `react-aria-components` (3.x) | Adobe. The most rigorous accessibility and internationalisation of the three — RTL, locale-aware dates/numbers, and mobile screen-reader coverage that the others don't match. Render props + slots for styling. Heavier API surface. **Recommend for enterprise, government, regulated, or anything with a VPAT requirement.** Lower-level hooks (`react-aria`, `react-stately`) are there when you need to build something the components don't cover. |
| **Ark UI** | `@ark-ui/react` | Zag.js state machines under the hood; the same components across React/Vue/Solid/Svelte. Pick it when you must ship the same system to more than one framework. |
| **Headless UI** | `@headlessui/react` | Tailwind Labs. Small component set, very simple API. Fine for a handful of interactions, too thin to base a full design system on. |
| **Build in-house** | — | Only with a dedicated a11y engineer. A correct combobox is roughly 2,000 lines and a year of edge cases. This choice is almost always a mistake; say so once, then respect the decision. |

**Where they differ in practice** — the polymorphism API, which leaks into every component you write:

```tsx
// Base UI — render prop
<Menu.Item render={<Link href="/settings" />}>Settings</Menu.Item>

// Radix — asChild (clones the single child, merges props)
<DropdownMenu.Item asChild><Link href="/settings">Settings</Link></DropdownMenu.Item>

// React Aria — slots + render props on state
<MenuItem href="/settings">{({ isSelected }) => <>Settings {isSelected && <Check/>}</>}</MenuItem>
```

Pick the convention once and use it everywhere. Mixed conventions inside one system are the most common cause of "why does this component not compose".

---

## 2. Component layer

What sits between the primitives and the product.

| Option | Take |
|---|---|
| **shadcn-style (own the code)** | `npx shadcn@latest init` — CLI v4 takes `--base radix \| base \| aria` to pick the primitive layer, and understands Tailwind v4's `@theme`. Components are *generated into your repo*: no dependency, no upgrade treadmill, total restyling freedom, and you own the maintenance. **The default for teams that want a real design system rather than a vendor's design system.** Its registry format is also how you distribute your own components internally. |
| **Pure primitives** | Maximum control, maximum work. Correct when the design is genuinely bespoke and the team has the capacity. |
| **MUI** | `@mui/material`. Enormous component set, mature data grid + date pickers, strong enterprise support. The theming API is a world of its own and the visual identity is hard to escape. Best when velocity beats distinctiveness. |
| **Mantine** | `@mantine/core`. Batteries-included but lighter than MUI, excellent hooks library, CSS-modules-based styling. A good middle path. |
| **Chakra UI** | v3 rebuilt on Ark/Zag with a Panda-style styling engine. Strong composition story. |
| **HeroUI** (was NextUI) | `@heroui/react`, v3 (ground-up rewrite, Mar 2026). React Aria Components underneath, Tailwind **v4** styling, 75+ components with a compound API (`Card.Header`, `Select.Item`), no `<Provider>`, CSS-only animation, and an AI surface (MCP server, `llms.txt`, agent skills) out of the box. Apache 2.0. **Picking it decides two questions at once** — it requires Tailwind v4, so the CSS-system answer is coupled — and it is a pre-styled library: strong a11y + velocity, but the modern-gradient look is its identity, not yours. Surface it when the interview says Tailwind + React Aria and velocity beats brand. |
| **Ant Design** | `antd`. Dense enterprise/admin surfaces, very complete forms and tables, strong in APAC markets. Distinctive look, heavy. |
| **Park UI / Radix Themes** | Pre-styled layers over Ark and Radix respectively — a fast way to a coherent look before you invest in your own. |

**Guidance:** if the answer to "why do we need a design system" is *brand consistency*, do not adopt a pre-styled library — you will spend more fighting its opinions than you would have spent building. If the answer is *velocity on internal tools*, adopt one and move on.

---

## 3. CSS system

| System | Package | Take |
|---|---|---|
| **Tailwind v4** | `tailwindcss` + `@tailwindcss/vite` | CSS-first: config lives in CSS via `@theme`, and **every theme token becomes a CSS custom property automatically** — which makes it the shortest path from a DTCG token file to something components can use. Rust engine, sub-100ms builds. RSC-safe. Costs: verbose class strings, and a design system published as a Tailwind preset asks something of consumers. |
| **CSS Modules** | built into Vite/Next | Plain CSS, scoped by filename. Zero runtime, zero build magic, RSC-safe, works with any tooling, and every developer already knows it. Tokens are just CSS custom properties. **The most boring and most durable choice** — recommend it when the team is styling-fatigued or when the DS must be consumed by unknown toolchains. |
| **StyleX** | `@stylexjs/stylex` | Meta's build-time atomic CSS. Typed variables (`stylex.defineVars`), deterministic merge order (the last style wins, predictably — which is a genuine advantage over the CSS cascade), tiny output at scale. Stricter: no arbitrary dynamic styles without care, and the ecosystem is small. Best for large apps where style collisions and CSS size are real problems. |
| **vanilla-extract** | `@vanilla-extract/css` | Styles in `.css.ts` with full type safety and **compile-time token contracts** — `createThemeContract` makes it a type error to forget a token in a theme. Zero runtime, RSC-safe. The strongest choice when correctness of theming matters more than authoring speed. |
| **Panda CSS** | `@pandacss/dev` | Build-time CSS-in-JS with a design-token-first config, recipes/slot-recipes for variants, and static extraction. RSC-safe. Excellent variant ergonomics; a real build step to own. |
| **Emotion / styled-components** | `@emotion/react`, `styled-components` | Runtime CSS-in-JS. **Do not start a new system here in 2026** — they need a client runtime, which fights React Server Components and streaming SSR, and styled-components is in maintenance. Support them only when migrating an existing codebase. |
| **UnoCSS** | `unocss` | Atomic engine, Tailwind-compatible presets, very fast, highly customisable. Smaller community. |

Whatever is chosen, the rule does not change: **the CSS system consumes tokens, it does not define them.** Tokens live in DTCG JSON; the CSS system gets a generated artifact. That is what makes re-theming and multi-brand possible, and what lets you change CSS systems later without redesigning.

---

## 4. Motion

| Library | Package | Take |
|---|---|---|
| **Motion** | `motion` (import from `motion/react`) | Formerly Framer Motion. React-first: `<motion.div>`, variants, layout animations, gesture handling, `AnimatePresence` for exit animations (which plain CSS cannot do well). ~5kb for the mini bundle. **Default for product UI.** |
| **GSAP** | `gsap` + `@gsap/react` (`useGSAP`) | Timeline choreography and ScrollTrigger with a decade of production hardening; framework-agnostic, so the knowledge transfers. Core ~22kb. **Pick it when motion is part of the brand** — scroll-driven marketing, editorial, launch pages. Inside React it always reads as "GSAP in React" rather than React-native code. |
| **CSS only** | — | Transitions and `@keyframes` driven by duration/easing tokens. Zero JS, best performance, works in RSC without a client boundary. Sufficient for hover/focus/press and simple enter transitions. Cannot do interruptible spring physics, layout animation, or reliable exit animation. |
| **React Spring** | `@react-spring/web` | Physics-based, imperative control. Niche now that Motion has springs. |
| **AutoAnimate** | `@formkit/auto-animate` | One line, animates list add/remove/reorder. Not a system, but a great cheap win. |

Regardless of choice, **motion values are tokens** (`duration.fast`, `easing.emphasized`) and `prefers-reduced-motion` is handled once at the system level, not per component. See the `motion-system` skill.

---

## 5. Supporting cast (assume these unless the user objects)

- **Docs/workbench**: Storybook 10 (`storybook`) with the **Vitest addon** — the old `@storybook/test-runner` is superseded. Stories double as test cases via play functions, and the a11y addon runs axe inside the same pass. The custom inventory site complements Storybook (it is the *catalogue*, Storybook is the *workbench*); a team can run either or both.
- **Tokens**: DTCG format (`Design Tokens Format Module`, stable **2025.10**). Style Dictionary v5 if you need the plugin ecosystem or Figma round-trips via Tokens Studio; the plugin's dependency-free `build.mjs` if you do not.
- **Testing**: Vitest + `@testing-library/react` + `@testing-library/user-event`, `axe-core`/`vitest-axe` for a11y, Playwright for cross-browser and visual regression, Chromatic if the budget exists.
- **Lint**: ESLint flat config + `eslint-plugin-jsx-a11y` + the generated `eslint-plugin-design-system` (token enforcement, import boundaries), Stylelint for CSS, `knip` for dead exports.
- **Release**: Changesets, `publint` + `@arethetypeswrong/cli` in CI.
