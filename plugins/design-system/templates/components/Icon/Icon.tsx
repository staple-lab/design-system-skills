import { type ComponentType, type SVGProps } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../../lib/cn';

/**
 * Sizes are em-based, not px: an icon's one job is to sit next to text, and em keeps
 * the pair matched at every type size without anyone auditing call sites — `md` is
 * 20px inside body (16px) text and 17.5px inside body-sm, both correct. If the system
 * later needs pixel-fixed icons (toolbar grids, virtualised lists), add an `icon.size`
 * set to component.tokens.json and consume those vars here — a raw px value
 * here would be invisible to theming and to the token scanner.
 */
export const iconVariants = cva(
  [
    // shrink-0 matters more than it looks: icons sit in flex rows next to truncating
    // text, and a squashed 13.7px icon is the classic symptom of forgetting it.
    'inline-block shrink-0 select-none',
    // Optically centres against adjacent text; align-middle sits visibly high at 1em.
    'align-[-0.125em]',
  ],
  {
    variants: {
      size: {
        sm: 'size-[1em]', //     16px in body text — dense rows, inline-with-text
        md: 'size-[1.25em]', //  20px in body text — the default, pairs with control md
        lg: 'size-[1.5em]', //   24px in body text — page headers, empty states
      },
    },
    defaultVariants: { size: 'md' },
  },
);

/** Any SVG icon component: lucide-react is the recommended source, but the wrapper is
 * source-agnostic on purpose — heroicons, a designer's custom set, or a one-off inline
 * component all fit this shape. Never re-export an icon set from the barrel (the
 * classic bundle blowout); consumers import the icons they use directly. */
type SvgIconComponent = ComponentType<SVGProps<SVGSVGElement>>;

/**
 * The a11y invariant is structural: `aria-hidden`, `aria-label` and `role` are Omit-ed
 * from the props, so `label` is the ONLY way to make an icon meaningful — and it sets
 * all three consistently. The two broken states (a role with no name, a name on a
 * hidden node) cannot be expressed in the types at all.
 */
export interface IconProps
  extends Omit<SVGProps<SVGSVGElement>, 'aria-hidden' | 'aria-label' | 'role' | 'children' | 'color'>,
    VariantProps<typeof iconVariants> {
  /** The icon to render, e.g. `icon={Truck}` from lucide-react. */
  icon: SvgIconComponent;
  /**
   * Names the icon for assistive tech (`role="img"` + `aria-label`). Omit it — the
   * default — and the icon is decorative (`aria-hidden`), which is correct whenever
   * adjacent text already says the same thing. Provide it ONLY when the icon is the
   * sole carrier of meaning, e.g. a status glyph in a table cell with no text.
   */
  label?: string;
}

export function Icon({ icon: IconComponent, size = 'md', label, className, ...rest }: IconProps) {
  return (
    <IconComponent
      className={cn(iconVariants({ size }), className)}
      // Colour is NOT set here, deliberately. Icon sets draw with `currentColor`
      // themselves (lucide: stroke="currentColor" fill="none"), which inherits the
      // surrounding text colour for free. A CSS `fill: currentColor` would beat the
      // fill="none" presentation attribute and render stroke icons as solid blobs.
      focusable="false"
      data-size={size ?? 'md'}
      {...(label ? { role: 'img', 'aria-label': label } : { 'aria-hidden': true })}
      {...rest}
    />
  );
}
