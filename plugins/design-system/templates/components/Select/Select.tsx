import { useId, type ComponentPropsWithRef, type ReactNode } from 'react';
import { Select as BaseSelect } from '@base-ui/react/select';
import { cn } from '../../lib/cn';
import styles from './Select.module.css';

/**
 * Select, built on Base UI's Select primitive.
 *
 * Part names verified against @base-ui/react at template authoring — verify against your
 * installed version; compound part naming is exactly the level that shifts between majors.
 *
 * Porting to another primitive layer:
 * - Radix (`@radix-ui/react-select`): Content/Viewport in place of Positioner/Popup (plus
 *   ScrollUpButton/ScrollDownButton), and its popup is select-menu positioned — it opens
 *   OVER the trigger, aligned to the selected item, not below it. That is a visual
 *   difference to decide on deliberately, not a bug to fix.
 * - React Aria: compose Select + Button + SelectValue + Popover + ListBox + ListBoxItem
 *   from `react-aria-components`, and let ITS Label/Text slots carry the label,
 *   description and error — do not bolt this file's id wiring onto a layer that ships
 *   its own slots.
 *
 * Never compose a Select from a Popover and a hand-rolled listbox: typeahead, wheel and
 * touch scrolling, and aria-activedescendant management are the expensive 80% you would
 * be signing up to own.
 */

export interface SelectProps<T extends string = string>
  extends Omit<ComponentPropsWithRef<'button'>, 'value' | 'defaultValue' | 'onChange' | 'children'> {
  /** Controlled value. Pair with `onValueChange`; never combine with `defaultValue`. */
  value?: T;
  /** Uncontrolled initial value. */
  defaultValue?: T;
  /** Fires with the new value in BOTH modes — controlled/uncontrolled parity is contract. */
  onValueChange?: (value: T) => void;
  /**
   * Required, and required BY THE TYPE: a select without a label is a WCAG failure, and
   * a props type is a better enforcement mechanism than a review comment.
   */
  label: string;
  /** Helper text below the field. Joins the trigger's aria-describedby chain. */
  description?: string;
  /**
   * Error text below the field. Sets `aria-invalid`, joins aria-describedby AFTER the
   * description, and announces on appearance. Border colour alone is never the signal.
   */
  error?: string;
  /** Shown in the trigger while no value is selected. */
  placeholder?: string;
  /** Heights come from control.height.*, the same scale as Button/TextField. @default 'md' */
  size?: 'sm' | 'md';
  disabled?: boolean;
  required?: boolean;
  /**
   * Form field name. Base UI renders the hidden input for form participation itself when
   * this is set — pass it through and never hand-roll a mirror `<input>`, which is a
   * second source of truth waiting to disagree with the first.
   */
  name?: string;
  /** `<Select.Item>` / `<Select.Group>` / `<Select.Separator>` children — compound parts,
   * not an `options` array. An array prop is tidier until the first item needs an icon, a
   * description line, or a disabled state with a reason; then it grows a renderer prop
   * and has rebuilt children, worse. */
  children: ReactNode;
}

export function Select<T extends string = string>({
  value,
  defaultValue,
  onValueChange,
  label,
  description,
  error,
  placeholder,
  size = 'md',
  disabled,
  required,
  name,
  className,
  children,
  // `ref` rides along in rest (React 19 ref-as-prop), flows to the Trigger, and lands on
  // the real <button> — same escape-hatch posture as Button.
  ...rest
}: SelectProps<T>) {
  const id = useId();
  const labelId = `${id}-label`;
  const triggerId = `${id}-trigger`;
  const descriptionId = description ? `${id}-description` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  // Description first, error second: the chain reads in the order the text renders.
  const describedBy = [descriptionId, errorId].filter(Boolean).join(' ') || undefined;

  return (
    <div className={cn(styles.field, className)} data-size={size}>
      {/* A <button> is a labelable element, so htmlFor works exactly as it does for a
          native <select>: the label names the trigger, and clicking it focuses/opens. */}
      <label id={labelId} htmlFor={triggerId} className={styles.label}>
        {label}
        {required && (
          // aria-hidden: `required` already reaches assistive tech through the control's
          // own required semantics; announcing "star" on top of that is noise.
          <span aria-hidden="true" className={styles.requiredMark}>
            *
          </span>
        )}
      </label>

      {/* No useState here, deliberately. value/defaultValue/onValueChange pass straight
          through, so controlled and uncontrolled are the PRIMITIVE's modes rather than a
          mirror of them — mirroring is the two-sources-of-truth bug the parity tests in
          Select.contract.test.tsx exist to catch. */}
      <BaseSelect.Root
        value={value}
        defaultValue={defaultValue}
        onValueChange={onValueChange}
        name={name}
        disabled={disabled}
        required={required}
      >
        <BaseSelect.Trigger
          id={triggerId}
          className={cn(styles.trigger, size === 'sm' && styles.sm)}
          aria-describedby={describedBy}
          aria-invalid={error ? true : undefined}
          data-size={size}
          {...rest}
        >
          {/* If your installed Base UI renders the raw value here instead of the item's
              text, pass `items` to Select.Root (or a children function to Select.Value) —
              check the installed version's docs. */}
          <BaseSelect.Value className={styles.value} placeholder={placeholder} />
          <BaseSelect.Icon className={styles.icon}>
            <ChevronIcon />
          </BaseSelect.Icon>
        </BaseSelect.Trigger>
        <BaseSelect.Portal>
          {/* z-index lives on the Positioner; the popup inherits its stacking context. */}
          <BaseSelect.Positioner
            className={styles.positioner}
            sideOffset={4} // = space.1 — the prop takes a number; keep it matching the token
            // Popover-positioned below the trigger. Base UI's default aligns the selected
            // item OVER the trigger (macOS-style, like Radix). Either is legitimate —
            // pick one and use it system-wide, because mixing the two reads as a bug.
            alignItemWithTrigger={false}
          >
            <BaseSelect.Popup className={styles.popup}>{children}</BaseSelect.Popup>
          </BaseSelect.Positioner>
        </BaseSelect.Portal>
      </BaseSelect.Root>

      {description && (
        <p id={descriptionId} className={styles.description}>
          {description}
        </p>
      )}
      {error && (
        // role="alert" so the error is ANNOUNCED when it appears — the describedby chain
        // alone only surfaces it on the next focus, which is after the user gave up.
        <p id={errorId} role="alert" className={styles.error}>
          {error}
        </p>
      )}
    </div>
  );
}

/* --- compound parts ------------------------------------------------------- */

export interface SelectItemProps extends Omit<ComponentPropsWithRef<'div'>, 'value'> {
  /** The value posted and selected. Stable and unique among siblings. */
  value: string;
  disabled?: boolean;
  children: ReactNode;
}

function SelectItem({ value, disabled, className, children, ...rest }: SelectItemProps) {
  return (
    <BaseSelect.Item
      value={value}
      disabled={disabled}
      className={cn(styles.item, className)}
      {...rest}
    >
      {/* Indicator first, in a fixed-width slot the CSS reserves even while unselected —
          otherwise every label shifts sideways the moment the selection changes. */}
      <BaseSelect.ItemIndicator className={styles.itemIndicator}>
        <CheckIcon />
      </BaseSelect.ItemIndicator>
      <BaseSelect.ItemText className={styles.itemText}>{children}</BaseSelect.ItemText>
    </BaseSelect.Item>
  );
}

export interface SelectGroupProps extends Omit<ComponentPropsWithRef<'div'>, 'children'> {
  /** Visible group heading, announced together with the group. */
  label: string;
  children: ReactNode;
}

function SelectGroup({ label, className, children, ...rest }: SelectGroupProps) {
  return (
    <BaseSelect.Group className={cn(styles.group, className)} {...rest}>
      <BaseSelect.GroupLabel className={styles.groupLabel}>{label}</BaseSelect.GroupLabel>
      {children}
    </BaseSelect.Group>
  );
}

function SelectSeparator({ className, ...rest }: ComponentPropsWithRef<'div'>) {
  // Purely visual, so role="presentation". Base UI ships no Select separator part at
  // template authoring time; Radix does (Select.Separator) — swap it in on that layer.
  return <div role="presentation" className={cn(styles.separator, className)} {...rest} />;
}

Select.Item = SelectItem;
Select.Group = SelectGroup;
Select.Separator = SelectSeparator;

/* --- icons ----------------------------------------------------------------- */
/* Inline and aria-hidden: these glyphs carry no meaning the trigger/item text does not. */

function ChevronIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" aria-hidden="true" focusable="false">
      <path
        d="M4 6l4 4 4-4"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" aria-hidden="true" focusable="false">
      <path
        d="M3.5 8.5l3 3 6-6"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
