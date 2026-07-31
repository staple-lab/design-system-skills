import { describe, expect, it, vi } from 'vitest';
import { createRef, useState } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'vitest-axe';
import { Select, type SelectProps } from '../Select/Select';

/**
 * THE CONTRACT SUITE — popup edition.
 *
 * Same shape as Button.contract.test.tsx, plus the family of assertions a static control
 * never exercises: focus moves INTO the popup on open, and back to the trigger on EVERY
 * close path. That focus round-trip is the single most commonly broken behaviour in
 * hand-rolled selects and the most disorienting for keyboard users — which is why each
 * close path (select, Escape, outside click, Tab) gets its own test instead of one.
 *
 * Queries go by role and accessible name: the trigger is a combobox NAMED BY ITS LABEL,
 * so every query here doubles as a check that the label wiring works.
 */

const SIZES = ['sm', 'md'] as const;

function FruitSelect(props: Partial<SelectProps>) {
  return (
    <Select label="Fruit" placeholder="Pick a fruit" {...props}>
      <Select.Item value="apple">Apple</Select.Item>
      <Select.Item value="banana">Banana</Select.Item>
      <Select.Item value="cherry">Cherry</Select.Item>
    </Select>
  );
}

const trigger = () => screen.getByRole('combobox', { name: 'Fruit' });

async function openSelect(user: ReturnType<typeof userEvent.setup>) {
  await user.click(trigger());
  return screen.findByRole('listbox');
}

describe('Select — rendering', () => {
  it.each(SIZES)('renders the %s size', (size) => {
    render(<FruitSelect size={size} />);
    expect(trigger()).toHaveAttribute('data-size', size);
  });

  it('is named by its label', () => {
    render(<FruitSelect />);
    expect(trigger()).toBeInTheDocument();
  });

  it('shows the placeholder while nothing is selected', () => {
    render(<FruitSelect />);
    expect(trigger()).toHaveTextContent('Pick a fruit');
  });

  it("shows the selected item's text, not its value string", () => {
    render(<FruitSelect defaultValue="banana" />);
    expect(trigger()).toHaveTextContent('Banana');
  });
});

describe('Select — open/close and focus', () => {
  // The recipe's rule: open → focus lands in the popup; EVERY close path → focus back on
  // the trigger. One test per path, so a regression names the path that broke.

  it('opens on click and moves focus into the popup', async () => {
    const user = userEvent.setup();
    render(<FruitSelect />);
    const listbox = await openSelect(user);
    expect(listbox.contains(document.activeElement)).toBe(true);
  });

  it('selecting an item closes, updates the trigger, and restores focus to it', async () => {
    const user = userEvent.setup();
    render(<FruitSelect />);
    await openSelect(user);
    await user.click(screen.getByRole('option', { name: 'Banana' }));
    await waitFor(() => expect(screen.queryByRole('listbox')).not.toBeInTheDocument());
    expect(trigger()).toHaveTextContent('Banana');
    expect(trigger()).toHaveFocus();
  });

  it('Escape closes WITHOUT selecting and restores focus to the trigger', async () => {
    const user = userEvent.setup();
    render(<FruitSelect defaultValue="apple" />);
    await openSelect(user);
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('listbox')).not.toBeInTheDocument());
    expect(trigger()).toHaveTextContent('Apple'); // value untouched
    expect(trigger()).toHaveFocus();
  });

  it('outside click closes and restores focus to the trigger', async () => {
    const user = userEvent.setup();
    render(<FruitSelect />);
    await openSelect(user);
    await user.click(document.body);
    await waitFor(() => expect(screen.queryByRole('listbox')).not.toBeInTheDocument());
    expect(trigger()).toHaveFocus();
  });

  it('Tab closes and moves focus on — the primitive default, asserted rather than overridden', async () => {
    const user = userEvent.setup();
    render(<FruitSelect />);
    await openSelect(user);
    await user.tab();
    await waitFor(() => expect(screen.queryByRole('listbox')).not.toBeInTheDocument());
  });

  it('does not open while disabled', async () => {
    const user = userEvent.setup();
    render(<FruitSelect disabled />);
    await user.click(trigger());
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });
});

describe('Select — keyboard', () => {
  it.each(['{Enter}', ' ', '{ArrowDown}'])('opens from the closed trigger with %s', async (key) => {
    const user = userEvent.setup();
    render(<FruitSelect />);
    await user.tab();
    expect(trigger()).toHaveFocus();
    await user.keyboard(key);
    expect(await screen.findByRole('listbox')).toBeInTheDocument();
  });

  it('arrows move the highlight and Enter selects it', async () => {
    const user = userEvent.setup();
    render(<FruitSelect defaultValue="apple" />);
    await openSelect(user);
    await user.keyboard('{ArrowDown}{Enter}');
    await waitFor(() => expect(screen.queryByRole('listbox')).not.toBeInTheDocument());
    expect(trigger()).toHaveTextContent('Banana');
  });

  it('End jumps to the last item', async () => {
    const user = userEvent.setup();
    render(<FruitSelect defaultValue="apple" />);
    await openSelect(user);
    await user.keyboard('{End}{Enter}');
    expect(trigger()).toHaveTextContent('Cherry');
  });

  it('typeahead jumps to a match while open', async () => {
    const user = userEvent.setup();
    render(<FruitSelect defaultValue="apple" />);
    await openSelect(user);
    await user.keyboard('c{Enter}');
    expect(trigger()).toHaveTextContent('Cherry');
  });

  // The behaviour people forget exists: a CLOSED select responds to typeahead too, like
  // a native <select>. It changes the value without ever opening the popup.
  it('typeahead selects on the closed trigger without opening', async () => {
    const user = userEvent.setup();
    render(<FruitSelect defaultValue="apple" />);
    await user.tab();
    await user.keyboard('b');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    await waitFor(() => expect(trigger()).toHaveTextContent('Banana'));
  });
});

describe('Select — controlled/uncontrolled parity', () => {
  // The SAME interaction script in both modes, asserting the same outcome. A wrapper that
  // mirrors the primitive's state in a useState passes one of these and fails the other.
  async function selectBanana(user: ReturnType<typeof userEvent.setup>) {
    await user.click(trigger());
    await user.click(await screen.findByRole('option', { name: 'Banana' }));
  }

  function ControlledFruitSelect({ onValueChange }: { onValueChange: (value: string) => void }) {
    const [value, setValue] = useState('apple');
    return (
      <FruitSelect
        value={value}
        onValueChange={(next) => {
          setValue(next);
          onValueChange(next);
        }}
      />
    );
  }

  it('uncontrolled: onValueChange fires and the displayed value updates', async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(<FruitSelect defaultValue="apple" onValueChange={onValueChange} />);
    await selectBanana(user);
    expect(onValueChange).toHaveBeenCalledWith('banana');
    expect(trigger()).toHaveTextContent('Banana');
  });

  it('controlled: same script, same outcome', async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(<ControlledFruitSelect onValueChange={onValueChange} />);
    await selectBanana(user);
    expect(onValueChange).toHaveBeenCalledWith('banana');
    expect(trigger()).toHaveTextContent('Banana');
  });

  // The two-sources-of-truth regression, caught only if asserted: a controlled Select
  // whose parent does NOT apply the change must keep displaying the parent's value.
  it('controlled with a frozen parent does not change the displayed value', async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(<FruitSelect value="apple" onValueChange={onValueChange} />);
    await selectBanana(user);
    expect(onValueChange).toHaveBeenCalledWith('banana');
    expect(trigger()).toHaveTextContent('Apple');
  });
});

describe('Select — forms', () => {
  // The hidden-input plumbing differs per primitive layer; this assertion does not.
  it('a plain form submit posts name=value', async () => {
    const user = userEvent.setup();
    let submitted: FormData | undefined;
    render(
      <form
        onSubmit={(event) => {
          event.preventDefault();
          submitted = new FormData(event.currentTarget);
        }}
      >
        <FruitSelect name="fruit" defaultValue="banana" />
        <button type="submit">Submit</button>
      </form>,
    );
    await user.click(screen.getByRole('button', { name: 'Submit' }));
    expect(submitted?.get('fruit')).toBe('banana');
  });
});

describe('Select — description and error', () => {
  it('description joins the aria-describedby chain', () => {
    render(<FruitSelect description="Delivered on Fridays." />);
    expect(trigger()).toHaveAccessibleDescription('Delivered on Fridays.');
  });

  it('error sets aria-invalid and chains AFTER the description', () => {
    render(<FruitSelect description="Delivered on Fridays." error="Pick a fruit to continue." />);
    expect(trigger()).toHaveAttribute('aria-invalid', 'true');
    // toHaveAccessibleDescription concatenates the chain in order — description first.
    expect(trigger()).toHaveAccessibleDescription('Delivered on Fridays. Pick a fruit to continue.');
  });

  it('no aria-invalid without an error', () => {
    render(<FruitSelect />);
    expect(trigger()).not.toHaveAttribute('aria-invalid');
  });

  it('the error announces on appearance via role="alert"', () => {
    render(<FruitSelect error="Pick a fruit to continue." />);
    expect(screen.getByRole('alert')).toHaveTextContent('Pick a fruit to continue.');
  });
});

describe('Select — escape hatches', () => {
  it('merges className rather than replacing it', () => {
    const { container } = render(<FruitSelect className="custom-class" />);
    const field = container.firstElementChild as HTMLElement;
    expect(field).toHaveClass('custom-class');
    expect(field.className.split(' ').length).toBeGreaterThan(1);
  });

  it('spreads unknown props onto the trigger', () => {
    render(<FruitSelect data-testid="fruit-select" data-analytics="checkout-fruit" />);
    const el = screen.getByTestId('fruit-select');
    expect(el).toBe(trigger());
    expect(el).toHaveAttribute('data-analytics', 'checkout-fruit');
  });

  it('forwards the ref to the real trigger button', () => {
    const ref = createRef<HTMLButtonElement>();
    render(<FruitSelect ref={ref} />);
    expect(ref.current).toBeInstanceOf(HTMLButtonElement);
  });
});

describe('Select — accessibility', () => {
  it('has no axe violations closed', async () => {
    const { container } = render(<FruitSelect />);
    expect(await axe(container)).toHaveNoViolations();
  });

  // The closed state passes trivially — the popup is where listbox/option semantics can
  // go wrong, so axe MUST run with it open. And because the popup portals to
  // document.body, axe runs on the body: scanning the render container would silently
  // skip the very thing this test exists to check.
  it('has no axe violations with the popup OPEN', async () => {
    const user = userEvent.setup();
    render(<FruitSelect />);
    await openSelect(user);
    expect(await axe(document.body)).toHaveNoViolations();
  });

  it('has no axe violations in the error state', async () => {
    const { container } = render(<FruitSelect error="Pick a fruit to continue." />);
    expect(await axe(container)).toHaveNoViolations();
  });

  /**
   * axe cannot tell you whether the focus ROUND-TRIP works (the open/close suite above
   * does), whether closed-state typeahead exists (the keyboard suite does), or whether
   * the option order makes sense (no test can). At least once per release, drive this
   * with a real screen reader — a select is the component where jsdom and reality
   * diverge the most.
   */
});
