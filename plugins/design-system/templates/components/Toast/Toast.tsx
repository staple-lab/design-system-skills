/*
 * Toast — the system's transient messaging surface: an imperative `toast()` API backed by
 * a module-level manager, plus one <ToastProvider> at the app root that renders the queue.
 *
 * Primitive: Base UI. Part names (Toast.Provider/Portal/Viewport/Root/Title/Description/
 * Action/Close, createToastManager, useToastManager) were verified against `@base-ui/react`
 * at template authoring; verify against YOUR installed version before trusting an import —
 * compound part naming is exactly the level that shifts between majors.
 *
 * Layer deltas, if this repo is not on Base UI:
 * - Radix ships `@radix-ui/react-toast` with the same Provider/Viewport/Root part shape but
 *   NO imperative manager — it is declarative-only. Keep this module's `toast()`/manager
 *   idea, hold the queue in your own store, and render a Radix `Toast.Root` per entry.
 * - React Aria Components ships no toast primitive. There, this manager + viewport pattern
 *   IS the implementation: keep the module-level queue and render the region
 *   (role="region" + aria-label, per-toast role="status"/"alert") and timers yourself.
 */
import { type ComponentPropsWithRef, type ReactNode } from 'react';
import { Toast as BaseToast } from '@base-ui/react/toast';
import { cn } from '../../lib/cn';
import styles from './Toast.module.css';

/** Banner shares this grammar — the two components are one messaging vocabulary,
 * transient (here) and persistent (Banner), mapped to the same semantic tokens. */
export type ToastVariant = 'info' | 'success' | 'warning' | 'danger';

export interface ToastOptions {
  title: string;
  description?: string;
  /** @default 'info' */
  variant?: ToastVariant;
  /**
   * ms before auto-dismiss. The Provider default (5000) is a floor, not a target — 2–3s
   * fails anyone who glanced away. Timers pause on hover, on focus within the viewport,
   * and on window blur; the primitive owns all three.
   */
  timeout?: number;
  /**
   * ONE action at most — a toast with two actions is a Dialog. And never make this the
   * only path to the action: the toast disappears, so "Undo" here must also exist
   * somewhere persistent (history, a menu), or a missed toast is data loss.
   */
  action?: { label: string; onClick: () => void };
}

/**
 * The manager lives at MODULE level, not in React state, because most toasts are not
 * fired from render: a fetch `.catch`, a websocket handler, a store effect — code with no
 * access to context. Base UI's `createToastManager` exists for exactly this; the Provider
 * below subscribes to it, so `toast()` works from anywhere in the bundle, React or not.
 */
const manager = BaseToast.createToastManager();

/** Fire a toast from anywhere. Returns the toast id (for `toast.dismiss`/updates). */
export function toast(options: ToastOptions): string {
  const { title, description, variant = 'info', timeout, action } = options;
  return manager.add({
    title,
    description,
    type: variant,
    timeout,
    // 'high' renders role="alert" / assertive, which interrupts whatever the screen
    // reader is mid-sentence on. Justified ONLY for failures needing action — a success
    // announced assertively is shouting. Everything else is 'low' → role="status".
    priority: variant === 'danger' ? 'high' : 'low',
    ...(action && { actionProps: { children: action.label, onClick: action.onClick } }),
  });
}

toast.success = (title: string, options: Omit<ToastOptions, 'title' | 'variant'> = {}) =>
  toast({ ...options, title, variant: 'success' });
toast.error = (title: string, options: Omit<ToastOptions, 'title' | 'variant'> = {}) =>
  toast({ ...options, title, variant: 'danger' });
toast.dismiss = (id: string) => manager.close(id);

export interface ToastProviderProps extends Omit<ComponentPropsWithRef<'div'>, 'children'> {
  children: ReactNode;
  /**
   * Max toasts visible at once; beyond it, new toasts queue FIFO rather than stacking —
   * eight stacked toasts cover the page and expire unread.
   * @default 3
   */
  limit?: number;
  /** Default auto-dismiss in ms; per-toast `timeout` overrides. @default 5000 */
  timeout?: number;
}

/**
 * Mount ONCE at the app root. `className`, `ref` and the rest spread reach the viewport
 * element — the list container — which is the node consumers position or restyle.
 */
export function ToastProvider({
  children,
  limit = 3,
  timeout = 5000,
  className,
  ...rest
}: ToastProviderProps) {
  return (
    <BaseToast.Provider toastManager={manager} limit={limit} timeout={timeout}>
      {children}
      {/* Portalled to the document root so `z.toast` competes only with other portals —
          and above z.modal on purpose: a toast must clear an open dialog. */}
      <BaseToast.Portal>
        {/* The viewport is the F6-reachable landmark; without that shortcut a keyboard
            user can never reach an Action button before the timeout. Focus is NEVER
            moved here on appear — appearing is not an interaction. */}
        <BaseToast.Viewport
          aria-label="Notifications"
          className={cn(styles.viewport, className)}
          {...rest}
        >
          <ToastList />
        </BaseToast.Viewport>
      </BaseToast.Portal>
    </BaseToast.Provider>
  );
}

function ToastList() {
  const { toasts } = BaseToast.useToastManager();
  return (
    <>
      {toasts.map((t) => (
        // Base UI wires role/aria-live from `priority`, runs the pause-aware timer, and
        // stamps data-starting-style / data-ending-style for the CSS enter/exit.
        <BaseToast.Root key={t.id} toast={t} className={styles.root} data-variant={t.type ?? 'info'}>
          <VariantGlyph variant={(t.type as ToastVariant) ?? 'info'} />
          <div className={styles.content}>
            <BaseToast.Title className={styles.title}>{t.title}</BaseToast.Title>
            {t.description != null && (
              <BaseToast.Description className={styles.description}>
                {t.description}
              </BaseToast.Description>
            )}
          </div>
          {/* Action renders the actionProps passed to manager.add; omit when there are none. */}
          {t.actionProps != null && <BaseToast.Action className={styles.action} />}
          {/* Every toast is dismissible — auto-dismiss is a convenience, not the only exit. */}
          <BaseToast.Close className={styles.close} aria-label="Dismiss notification">
            <CloseGlyph />
          </BaseToast.Close>
        </BaseToast.Root>
      ))}
    </>
  );
}

/* Both glyphs are decorative: the variant is already carried by the title text (and the
 * close button by its aria-label), so the icons are aria-hidden — colour + icon alone
 * would exclude everyone the colour or the icon doesn't reach. */

function VariantGlyph({ variant }: { variant: ToastVariant }) {
  return (
    <svg className={styles.icon} viewBox="0 0 16 16" fill="none" aria-hidden="true" focusable="false">
      <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.5" />
      {variant === 'success' ? (
        <path d="M5 8.2 7.2 10.4 11 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      ) : variant === 'info' ? (
        <path d="M8 7.5V11M8 5v.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      ) : (
        <path d="M8 5v3.5M8 11v.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      )}
    </svg>
  );
}

function CloseGlyph() {
  return (
    <svg className={styles.icon} viewBox="0 0 16 16" fill="none" aria-hidden="true" focusable="false">
      <path d="m4 4 8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}
