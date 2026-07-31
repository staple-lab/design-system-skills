# Toast

Wave 2 · layer-dependent (Base UI and Radix ship one; React Aria Components does not) · inherits
Dialog's portal and z-token rules but *none* of its focus behaviour — a toast must never take focus.
A reference template exists at `${CLAUDE_PLUGIN_ROOT}/templates/components/Toast/` (CSS Modules
form, Base UI primitive) — adapt it to the repo's stack rather than starting blank.

## Primitive mapping

| Layer | Ships it as | The work left for you |
|---|---|---|
| Base UI | `Toast` compound (Provider/Portal/Viewport/Root/Title/Description/Action/Close) plus `createToastManager()` for imperative use outside React and `useToastManager()` inside | Styling, variants, tokens. Queue, timers, pause behaviour, politeness and the F6 shortcut are bought. |
| Radix | `@radix-ui/react-toast` (Provider/Viewport/Root/Title/Description/Action/Close) | Same styling work, **plus the queue**: Radix is declarative-only — no imperative manager — so you keep this recipe's module-level manager and render a `Toast.Root` per queue entry yourself. Hotkey defaults to F8, configurable. |
| React Aria | Nothing in `react-aria-components` | Compose it: this recipe's manager + a `role="region"` viewport with an accessible name, per-toast `role="status"`/`"alert"`, timers with the three pause conditions. The reference template's manager pattern IS the implementation here — you just also own what Base UI's parts would have done. |

Verify part names against the installed version's docs before writing imports — compound part
naming is exactly the level that shifts between majors. **Never** rebuild the timer/politeness
layer when the primitive ships one: pause-on-focus and live-region timing are the invisible 80%.

The public API is a *function*, `toast(...)`, backed by a **module-level manager**, plus one
`<ToastProvider>` at the app root that subscribes to it and renders the queue. The manager cannot
live in React state alone because most toasts are not fired from render — they come from a fetch
`.catch`, a websocket handler, a store effect — code with no access to context. A hook-only
`useToast()` works until the first non-React callsite, then grows a global anyway; start with the
global and let the hook be sugar over it.

## Props API sketch

```tsx
function toast(options: ToastOptions): string;          // returns id
toast.success(title, opts?); toast.error(title, opts?); toast.dismiss(id);

interface ToastOptions {
  title: string; description?: string;
  variant?: 'info' | 'success' | 'warning' | 'danger';  // default 'info' — Banner shares this grammar
  action?: { label: string; onClick: () => void };      // optional, ONE — a toast with two actions is a Dialog
  timeout?: number;                                     // ms; default 5000, the floor not the target
}

interface ToastProviderProps { limit?: number /* 3 */; timeout?: number /* 5000 */; children: ReactNode }
```

**Politeness.** `role="status"` (polite) for info/success/warning: it waits for the screen reader
to finish speaking. `role="alert"` (assertive) **only** for failures needing action — assertive
interrupts mid-sentence, and a success announced that way is shouting. In Base UI this maps to the
toast's `priority: 'low' | 'high'`.

**Timing.** Minimum ~5s auto-dismiss — 2–3s fails anyone who glances away. Pause the timer on
viewport hover AND on focus within AND on window blur; implementations that remember only hover
dismiss toasts while the user is in another window or navigating by keyboard.

**Queue.** ~3 visible max; beyond that, queue FIFO rather than stacking — eight stacked toasts
cover the page and expire unread. Every toast dismissible. And never make a toast the *only* path
to an action: "Undo" in a delete toast is good, but the same undo must also exist in history or a
menu, or a missed toast is data loss.

## States (style from these, never from React state)

`data-variant` (yours, from the option) for the four variants. Enter/exit: Base UI stamps
`data-starting-style` / `data-ending-style` around mount/unmount; Radix uses
`data-state="open|closed"`. Base UI also exposes stacking hooks for the collapsed-stack
treatment — check the installed version's docs for their names.

## Tokens consumed

Surface: `color.bg.surface`, `color.fg.default` title / `color.fg.muted` description,
`color.border.subtle` hairline, `shadow.overlay`, `radius.lg`, `z.toast` on the viewport (above
`z.modal` — a toast must clear an open dialog). Variant accent: `color.fg.{accent,success,warning,danger}`
on an edge or icon only — the body stays `fg.default`; tinted body on tinted surface is Banner's
look, not Toast's. Spacing: `space.3`/`space.4`; `type.label` title, `type.body-sm` description.
Motion: `duration.normal` + `easing.decelerate` in, `duration.fast` + `easing.accelerate` out.

## Keyboard map (the test contract asserts every row)

| Keys | Where | Action |
|---|---|---|
| `F6` (Base UI) / `F8` (Radix default) | page | Focus to the viewport — without this shortcut keyboard users can never reach an Action before timeout |
| `Tab` / `Shift+Tab` | viewport | Through each toast's action and close button, then back out |
| `Enter` / `Space` | action / close | Activates it |
| `Escape` | focus in viewport | Dismisses the focused toast |
| *(none)* | on appear | A toast **never** steals focus — appearing is not an interaction |

## Test contract, beyond the generic suite

- Focus NOT stolen on appear: focus an input, fire `toast()`, assert `document.activeElement` is
  still the input. The anti-Dialog assertion, and the one regression overlay-minded refactors add.
- Timer pauses (fake timers): fire a toast, hover the viewport, advance past `timeout` — still
  present; unhover, advance — gone. Repeat for focus-within and for window `blur`.
- Queue overflow: fire `limit + 2`; exactly `limit` render; dismiss one; a queued toast replaces it.
- Politeness: success renders `role="status"`; danger renders `role="alert"`. Assert the roles.
- Imperative from outside React: call `toast()` from a plain function (no component, no hook) —
  it must render. This is the assertion that keeps the manager module-level.
- Every dismissal path: close button, Escape with focus inside, timeout expiry.

## Meta seeds (do/don't)

- **Do** confirm background and async outcomes — "Changes saved", "Export ready". **Don't**
  announce what the user is already looking at; an inline success state doesn't need a toast twin.
- **Do** put "Undo" in a deletion toast *and* somewhere persistent. **Don't** make a toast the only
  path to any action — disappearing is its design property, not a bug to extend the timeout over.
- **Do** reserve `variant="danger"` + assertive politeness for failures needing action. **Don't**
  use a toast for errors the user must resolve — that's Banner: persistent and findable after the fact.
- **Do** keep it to a title and one short line. **Don't** put paragraphs, forms or two actions in
  a toast — content that needs reading time or a decision is a Dialog or a Banner.
