import {
  createContext,
  useContext,
  useMemo,
  useState,
  type ComponentPropsWithRef,
} from 'react';
import { cn } from '../../lib/cn';

/**
 * The boundary that keeps this component maintainable: Table renders and announces; it
 * NEVER owns data logic. It takes already-sorted rows plus a sort descriptor and echoes
 * header clicks back through `onSortChange` — the consumer (or TanStack Table, which is
 * a state engine, not a component) re-sorts and re-renders. The moment a table sorts,
 * it needs per-type comparators, locale collation, null placement and a server-side
 * flag — a data library's surface grafted onto a styling component.
 *
 * It is also deliberately a table, not a `role="grid"`: grid is an interactive widget
 * that takes over the arrow keys and demands complete roving-cell focus. For reading
 * data, native table semantics leave navigation to the browser and screen reader.
 */

export type SortDirection = 'ascending' | 'descending';

/** `C` narrows column ids to the union the call site actually renders, so
 * `onSortChange` cannot hand back a column that does not exist. */
export interface SortDescriptor<C extends string = string> {
  column: C;
  direction: SortDirection;
}

interface TableContextValue {
  sortDescriptor?: SortDescriptor;
  onSortChange?: (descriptor: SortDescriptor) => void;
  stickyHeader: boolean;
  selectedKeys: ReadonlySet<string>;
  toggleKey: (key: string) => void;
  setKeys: (keys: readonly string[], selected: boolean) => void;
}

const TableContext = createContext<TableContextValue | null>(null);
/** The enclosing Row's key, so SelectCell does not make callers repeat it per cell. */
const RowKeyContext = createContext<string | undefined>(undefined);

export interface TableProps<C extends string = string>
  // The omitted trio are the legacy presentational attributes — styling is the tokens' job.
  extends Omit<ComponentPropsWithRef<'table'>, 'border' | 'cellPadding' | 'cellSpacing'> {
  /**
   * The sort currently APPLIED BY YOU to the rows you passed. Controlled only — an
   * uncontrolled sort descriptor would flip the header arrow while the rows stay put,
   * which is a lie in the UI. There is no uncontrolled mode on purpose.
   */
  sortDescriptor?: SortDescriptor<C>;
  /** "Re-sort and re-render." The table itself never reorders rows. */
  onSortChange?: (descriptor: SortDescriptor<C>) => void;
  /** Row selection; keys are the `rowKey` values on Rows. Controlled and uncontrolled. */
  selectedKeys?: ReadonlySet<string>;
  defaultSelectedKeys?: ReadonlySet<string>;
  /** Fires in BOTH modes. */
  onSelectionChange?: (keys: ReadonlySet<string>) => void;
  /**
   * Pins the header row inside the nearest scroll container. The consumer owns that
   * container (max-height + overflow), like they own the data — a wrapper div imposed
   * here would break every full-page table.
   */
  stickyHeader?: boolean;
}

function TableRoot<C extends string = string>({
  className,
  sortDescriptor,
  onSortChange,
  selectedKeys,
  defaultSelectedKeys,
  onSelectionChange,
  stickyHeader = false,
  ...rest
}: TableProps<C>) {
  const [internalKeys, setInternalKeys] = useState<ReadonlySet<string>>(
    () => defaultSelectedKeys ?? new Set(),
  );
  const keys = selectedKeys ?? internalKeys;

  const context = useMemo<TableContextValue>(() => {
    const update = (next: ReadonlySet<string>) => {
      if (selectedKeys === undefined) setInternalKeys(next); // uncontrolled keeps state
      onSelectionChange?.(next); // …and the callback fires either way
    };
    return {
      sortDescriptor,
      onSortChange: onSortChange as TableContextValue['onSortChange'],
      stickyHeader,
      selectedKeys: keys,
      toggleKey: (key: string) => {
        const next = new Set<string>(keys);
        if (next.has(key)) next.delete(key);
        else next.add(key);
        update(next);
      },
      setKeys: (all: readonly string[], selected: boolean) => {
        const next = new Set<string>(keys);
        for (const key of all) {
          if (selected) next.add(key);
          else next.delete(key);
        }
        update(next);
      },
    };
  }, [sortDescriptor, onSortChange, stickyHeader, keys, selectedKeys, onSelectionChange]);

  return (
    <TableContext.Provider value={context}>
      {/* border-separate, never border-collapse: collapsed borders are painted by the
          TABLE, so a sticky header scrolls out from under its own bottom rule. With
          separate + zero spacing, each rule belongs to the cell and stays pinned. */}
      <table
        className={cn(
          'w-full border-separate border-spacing-0 text-start',
          'bg-surface text-foreground',
          'text-[length:var(--ds-type-body-sm-font-size)] leading-[var(--ds-type-body-sm-line-height)]',
          className,
        )}
        data-sticky-header={stickyHeader ? '' : undefined}
        {...rest}
      />
    </TableContext.Provider>
  );
}

function Head({ className, ...rest }: ComponentPropsWithRef<'thead'>) {
  return <thead className={cn('text-start', className)} {...rest} />;
}

function Body({ className, ...rest }: ComponentPropsWithRef<'tbody'>) {
  return <tbody className={className} {...rest} />;
}

// Native `onSelect` is the text-selection DOM event; sitting next to `rowKey` it reads
// like row selection, so it is omitted to keep the trap out of autocomplete.
export interface RowProps extends Omit<ComponentPropsWithRef<'tr'>, 'onSelect'> {
  /** Stable id for selection. Optional — read-only tables need no keys. */
  rowKey?: string;
}

function Row({ rowKey, className, ...rest }: RowProps) {
  const context = useContext(TableContext);
  const selected = rowKey !== undefined && context?.selectedKeys.has(rowKey);
  return (
    <RowKeyContext.Provider value={rowKey}>
      <tr
        data-selected={selected ? '' : undefined}
        className={cn(
          'transition-colors duration-[var(--ds-duration-fast)] ease-[var(--ds-easing-standard)]',
          selected && 'bg-accent-subtle',
          className,
        )}
        {...rest}
      />
    </RowKeyContext.Provider>
  );
}

const headerCellClasses = [
  'px-[var(--ds-space-4)] py-[var(--ds-space-2)] align-middle text-start whitespace-nowrap',
  'text-[length:var(--ds-type-label-font-size)] font-medium text-fg-muted',
  // The stronger of the two rules: header/body boundary. Body rows use border-subtle.
  'border-b-[length:var(--ds-border-width-sm)] border-[color:var(--ds-color-border-default)]',
];

// Sticky cells paint their OWN background — rows slide beneath them, and a transparent
// pinned header shows every row ghosting through it.
const stickyCellClasses = 'sticky top-0 z-[var(--ds-z-sticky)] bg-surface';

export interface HeaderCellProps<C extends string = string>
  extends Omit<ComponentPropsWithRef<'th'>, 'align'> { // legacy presentational attribute
  /** Present ⇒ sortable: the id handed back through `onSortChange`. */
  column?: C;
}

function HeaderCell<C extends string = string>({
  column,
  className,
  children,
  ...rest
}: HeaderCellProps<C>) {
  const context = useContext(TableContext);
  const sortable = column !== undefined && context?.onSortChange !== undefined;
  const direction =
    column !== undefined && context?.sortDescriptor?.column === column
      ? context.sortDescriptor.direction
      : undefined;

  return (
    <th
      scope="col"
      // aria-sort goes on the SORTED column only. `none` on every column is noise —
      // one column carries the sort; the rest stay silent.
      aria-sort={direction}
      data-sorted={direction}
      className={cn(
        headerCellClasses,
        context?.stickyHeader && stickyCellClasses,
        direction && 'text-foreground',
        className,
      )}
      {...rest}
    >
      {sortable ? (
        // A real button — a clickable <th> is invisible to the keyboard; the button
        // brings focus, Enter/Space and a ring for free.
        <button
          type="button"
          className={cn(
            'inline-flex cursor-pointer items-center gap-[var(--ds-space-1)]',
            'rounded-[var(--ds-radius-sm)] font-medium whitespace-nowrap select-none',
            // Pads the hit area; the negative margin keeps the label flush with
            // unsortable headers and with the cell text below.
            '-mx-[var(--ds-space-2)] px-[var(--ds-space-2)] py-[var(--ds-space-1)]',
            'hover:bg-subtle hover:text-foreground',
            'transition-colors duration-[var(--ds-duration-fast)] ease-[var(--ds-easing-standard)]',
            'outline-none focus-visible:outline-[length:var(--ds-focus-ring-width)] focus-visible:outline-[color:var(--ds-color-ring)] focus-visible:outline-offset-[var(--ds-focus-ring-offset)]',
          )}
          onClick={() =>
            // Toggle ascending ↔ descending; no third "unsorted" state — unsorted means
            // "the order rows arrived in", which the table cannot describe or announce.
            context!.onSortChange!({
              column: column!,
              direction: direction === 'ascending' ? 'descending' : 'ascending',
            })
          }
        >
          {children}
          <SortIcon direction={direction} />
        </button>
      ) : (
        children
      )}
    </th>
  );
}

const cellClasses = [
  'px-[var(--ds-space-4)] py-[var(--ds-space-3)] align-middle',
  'border-b-[length:var(--ds-border-width-sm)] border-[color:var(--ds-color-border-subtle)]',
];

function Cell({ className, ...rest }: ComponentPropsWithRef<'td'>) {
  return <td className={cn(cellClasses, className)} {...rest} />;
}

// The checkbox column is the one column that always gets an explicit width.
const checkboxCellClasses = 'w-[var(--ds-space-10)] px-[var(--ds-space-3)] text-center';
const checkboxClasses = [
  'size-[var(--ds-space-4)] cursor-pointer align-middle',
  'accent-[color:var(--ds-color-bg-accent)]',
  'outline-none focus-visible:outline-[length:var(--ds-focus-ring-width)] focus-visible:outline-[color:var(--ds-color-ring)] focus-visible:outline-offset-[var(--ds-focus-ring-offset)]',
];

export interface SelectAllCellProps extends Omit<ComponentPropsWithRef<'th'>, 'align'> {
  /**
   * Every selectable rowKey, supplied by the consumer. Deliberate: the table never
   * knows the data set, so whether "select all" means this page or the whole result
   * set stays a product decision made where the data lives — and the header checkbox
   * cannot compute all/partial/none without the full list.
   */
  allKeys: readonly string[];
}

function SelectAllCell({
  allKeys,
  'aria-label': ariaLabel = 'Select all rows',
  className,
  ...rest
}: SelectAllCellProps) {
  const context = useContext(TableContext);
  const selected = context?.selectedKeys;
  const selectedCount = selected ? allKeys.reduce((n, k) => (selected.has(k) ? n + 1 : n), 0) : 0;
  const allSelected = allKeys.length > 0 && selectedCount === allKeys.length;

  return (
    <th
      scope="col"
      className={cn(
        headerCellClasses,
        context?.stickyHeader && stickyCellClasses,
        checkboxCellClasses,
        className,
      )}
      {...rest}
    >
      <input
        type="checkbox"
        className={cn(checkboxClasses)}
        aria-label={ariaLabel}
        checked={allSelected}
        // `indeterminate` is a DOM property, not an HTML attribute — a ref callback is
        // the only way to set it declaratively.
        ref={(el: HTMLInputElement | null) => {
          if (el) el.indeterminate = selectedCount > 0 && !allSelected;
        }}
        onChange={() => context?.setKeys(allKeys, !allSelected)}
      />
    </th>
  );
}

export interface SelectCellProps extends Omit<ComponentPropsWithRef<'td'>, 'align'> {
  /**
   * REQUIRED, and it must name the row: `Select ${row.name}`. "Select row" fifty times
   * is fifty identical entries in a screen reader's form-controls list — the same
   * reasoning that makes aria-label required on an icon-only Button.
   */
  'aria-label': string;
}

function SelectCell({ 'aria-label': ariaLabel, className, ...rest }: SelectCellProps) {
  const context = useContext(TableContext);
  const rowKey = useContext(RowKeyContext);
  const checked = rowKey !== undefined && (context?.selectedKeys.has(rowKey) ?? false);

  return (
    <td className={cn(cellClasses, checkboxCellClasses, className)} {...rest}>
      <input
        type="checkbox"
        className={cn(checkboxClasses)}
        aria-label={ariaLabel}
        checked={checked}
        // A Row without a rowKey cannot be selected; disabling beats silently ignoring.
        disabled={rowKey === undefined}
        onChange={() => {
          if (rowKey !== undefined) context?.toggleKey(rowKey);
        }}
      />
    </td>
  );
}

function SortIcon({ direction }: { direction?: SortDirection }) {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={cn(
        'size-[var(--ds-space-3)] shrink-0 transition-transform duration-[var(--ds-duration-fast)]',
        direction === 'descending' && 'rotate-180',
      )}
    >
      {direction ? (
        // One arrow, rotated for descending — the transition makes the flip legible.
        <path d="M8 12.5v-9M4.5 7 8 3.5 11.5 7" />
      ) : (
        // Unsorted: a quiet both-ways glyph, so sortable columns are discoverable.
        <path d="M4.5 5.5 8 2l3.5 3.5M4.5 10.5 8 14l3.5-3.5" opacity="0.4" />
      )}
    </svg>
  );
}

export const Table = Object.assign(TableRoot, {
  Head,
  Body,
  Row,
  HeaderCell,
  Cell,
  SelectAllCell,
  SelectCell,
});
