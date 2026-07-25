import { cloneElement, isValidElement, type ComponentPropsWithRef, type ReactElement, type ReactNode } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../../lib/cn';

/**
 * Variants are defined ONCE here and the prop types are derived from them, so adding a
 * variant to the styles cannot desync from the type.
 */
export const buttonVariants = cva(
  [
    'relative inline-flex items-center justify-center gap-[var(--ds-control-gap)]',
    'font-medium whitespace-nowrap select-none',
    'rounded-[var(--ds-control-radius)]',
    'transition-[background-color,color,border-color,box-shadow] duration-[var(--ds-duration-fast)] ease-[var(--ds-easing-standard)]',
    // :focus-visible, never :focus — :focus fires on mouse click, which is what gets
    // focus styles deleted, which is what strands keyboard users.
    'outline-none focus-visible:outline-[length:var(--ds-focus-ring-width)] focus-visible:outline-[color:var(--ds-color-ring)] focus-visible:outline-offset-[var(--ds-focus-ring-offset)]',
    'disabled:pointer-events-none disabled:opacity-50',
    'aria-disabled:pointer-events-none aria-disabled:opacity-50',
    // Extends the hit area to 44px without changing the visual bounds.
    'before:absolute before:inset-[-4px] before:content-[""]',
  ],
  {
    variants: {
      variant: {
        primary: 'bg-accent text-accent-foreground hover:bg-accent-hover active:bg-accent-active',
        secondary: 'bg-subtle text-foreground hover:bg-subtle-hover active:bg-subtle-active',
        ghost: 'bg-transparent text-foreground hover:bg-subtle active:bg-subtle-hover',
        danger: 'bg-danger text-danger-foreground hover:bg-danger-hover',
      },
      size: {
        sm: 'h-[var(--ds-control-height-sm)] px-[var(--ds-control-padding-x-sm)] text-[length:var(--ds-type-body-sm-font-size)]',
        md: 'h-[var(--ds-control-height-md)] px-[var(--ds-control-padding-x-md)] text-[length:var(--ds-type-body-sm-font-size)]',
        lg: 'h-[var(--ds-control-height-lg)] px-[var(--ds-control-padding-x-lg)] text-[length:var(--ds-type-body-font-size)]',
      },
      fullWidth: { true: 'w-full', false: '' },
    },
    defaultVariants: { variant: 'primary', size: 'md', fullWidth: false },
  },
);

interface ButtonBaseProps
  extends Omit<ComponentPropsWithRef<'button'>, 'color'>,
    VariantProps<typeof buttonVariants> {
  /**
   * Shows a spinner and blocks activation while keeping the button focusable, so a
   * screen-reader user can still reach it and hear why nothing happened.
   * @default false
   */
  loading?: boolean;
  /** Announced while `loading`. @default 'Loading' */
  loadingLabel?: string;
  /** Rendered before the label. Use `start`/`end`, not `left`/`right` — those swap in RTL. */
  startIcon?: ReactNode;
  /** Rendered after the label. */
  endIcon?: ReactNode;
  /**
   * Render as a different element while keeping the button's styles and behaviour:
   * `render={<a href="/pricing" />}`. Prefer this over an `href` prop — the moment you
   * add `href` you are reimplementing an anchor, and `target`/`rel`/`download`/router
   * integration all follow.
   */
  render?: ReactElement;
}

/**
 * An icon-only button has no text to name it, so `aria-label` becomes REQUIRED in the
 * type system. A props type is a better enforcement mechanism than a lint rule and
 * infinitely better than a docs note.
 */
export type ButtonProps = ButtonBaseProps &
  ({ children: ReactNode; 'aria-label'?: string } | { children?: never; 'aria-label': string });

export function Button({
  className,
  variant = 'primary',
  size = 'md',
  fullWidth = false,
  loading = false,
  loadingLabel = 'Loading',
  startIcon,
  endIcon,
  disabled,
  render,
  children,
  onClick,
  ...rest
}: ButtonProps) {
  const classes = cn(buttonVariants({ variant, size, fullWidth }), className);

  const props = {
    className: classes,
    // `disabled` removes the element from the tab order entirely; `aria-disabled` keeps it
    // focusable so it can explain itself. Loading is temporary, so it uses the latter.
    disabled: disabled && !loading ? true : undefined,
    'aria-disabled': loading || disabled ? true : undefined,
    'aria-busy': loading ? true : undefined,
    'data-loading': loading ? '' : undefined,
    'data-variant': variant,
    'data-size': size,
    onClick: (event: React.MouseEvent<HTMLButtonElement>) => {
      if (loading || disabled) {
        event.preventDefault();
        return;
      }
      onClick?.(event);
    },
    ...rest,
    children: (
      <>
        {/* Hidden rather than removed, so the button does not resize when the spinner appears. */}
        <span className={cn('contents', loading && 'invisible')}>
          {startIcon}
          {children}
          {endIcon}
        </span>
        {loading && (
          <span className="absolute inset-0 grid place-items-center">
            <Spinner />
            <span className="sr-only">{loadingLabel}</span>
          </span>
        )}
      </>
    ),
  };

  if (render && isValidElement(render)) {
    // Base UI's `useRender` does this properly (including ref merging); this inline version
    // keeps the template dependency-free. Radix systems use `asChild` + Slot instead.
    const rendered = render as ReactElement<Record<string, unknown>>;
    return cloneElement(rendered, {
      ...props,
      className: cn(classes, (rendered.props as { className?: string }).className),
    });
  }

  return <button type="button" {...props} />;
}

function Spinner() {
  return (
    <svg
      className="size-4 animate-spin motion-reduce:animate-none"
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeOpacity="0.25" strokeWidth="2" />
      <path d="M14.5 8A6.5 6.5 0 0 0 8 1.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}
