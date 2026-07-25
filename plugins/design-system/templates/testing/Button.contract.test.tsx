import { describe, expect, it, vi } from 'vitest';
import { createRef, useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'vitest-axe';
import { Button } from '../Button/Button';

/**
 * THE CONTRACT SUITE.
 *
 * Copy this shape for every component. Keeping the sections identical across components
 * means a reviewer can see at a glance what is missing, and a new component cannot quietly
 * ship without focus tests.
 *
 * Everything here asserts BEHAVIOUR a consumer depends on. Nothing asserts class names or
 * DOM structure — that is what visual regression is for, and asserting on it is what makes
 * refactors painful.
 *
 * Queries go by role and accessible name, in the order:
 *   getByRole → getByLabelText → getByText → getByTestId (last resort)
 * This is not stylistic: getByRole('button', { name: 'Save' }) fails when the accessible
 * name breaks, which makes these functional tests double as accessibility tests.
 */

const VARIANTS = ['primary', 'secondary', 'ghost', 'danger'] as const;
const SIZES = ['sm', 'md', 'lg'] as const;

describe('Button — rendering', () => {
  it.each(VARIANTS)('renders the %s variant', (variant) => {
    render(<Button variant={variant}>Save</Button>);
    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument();
  });

  it.each(SIZES)('renders the %s size', (size) => {
    render(<Button size={size}>Save</Button>);
    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument();
  });

  it('defaults to type="button" so it cannot submit a form by accident', () => {
    render(<Button>Save</Button>);
    expect(screen.getByRole('button')).toHaveAttribute('type', 'button');
  });

  it('honours an explicit type', () => {
    render(<Button type="submit">Save</Button>);
    expect(screen.getByRole('button')).toHaveAttribute('type', 'submit');
  });
});

describe('Button — interaction', () => {
  it('calls onClick when activated with the mouse', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Save</Button>);
    await user.click(screen.getByRole('button'));
    expect(onClick).toHaveBeenCalledOnce();
  });

  // Enter and Space are separate code paths in the browser. Test both — a div with a
  // click handler passes the mouse test and fails these.
  it.each(['{Enter}', ' '])('activates with %s from the keyboard', async (key) => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Save</Button>);
    await user.tab();
    expect(screen.getByRole('button')).toHaveFocus();
    await user.keyboard(key);
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('does not fire onClick while disabled', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(
      <Button onClick={onClick} disabled>
        Save
      </Button>,
    );
    await user.click(screen.getByRole('button'));
    expect(onClick).not.toHaveBeenCalled();
  });

  it('does not fire onClick while loading, and blocks the double-submit', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(
      <Button onClick={onClick} loading>
        Save
      </Button>,
    );
    await user.click(screen.getByRole('button'));
    await user.click(screen.getByRole('button'));
    expect(onClick).not.toHaveBeenCalled();
  });
});

describe('Button — states', () => {
  it('a loading button stays focusable so a screen reader can reach it and hear why', async () => {
    const user = userEvent.setup();
    render(<Button loading>Save</Button>);
    const button = screen.getByRole('button');
    await user.tab();
    expect(button).toHaveFocus();
    expect(button).toHaveAttribute('aria-disabled', 'true');
    expect(button).toHaveAttribute('aria-busy', 'true');
  });

  it('a disabled button is removed from the tab order', async () => {
    const user = userEvent.setup();
    render(
      <>
        <Button disabled>Save</Button>
        <Button>Cancel</Button>
      </>,
    );
    await user.tab();
    expect(screen.getByRole('button', { name: 'Cancel' })).toHaveFocus();
  });

  it('announces the loading state', () => {
    render(<Button loading loadingLabel="Saving your changes">Save</Button>);
    expect(screen.getByText('Saving your changes')).toBeInTheDocument();
  });

  it('keeps the label in the layout while loading, so the button does not resize', () => {
    render(<Button loading>Save changes</Button>);
    // Present in the DOM (so width is preserved) but visually hidden.
    expect(screen.getByText('Save changes')).toBeInTheDocument();
  });
});

describe('Button — escape hatches', () => {
  // These exist so consumers do not fork the component. Untested, they rot silently.
  it('merges className rather than replacing it', () => {
    render(<Button className="custom-class">Save</Button>);
    const button = screen.getByRole('button');
    expect(button).toHaveClass('custom-class');
    expect(button.className.split(' ').length).toBeGreaterThan(1);
  });

  it('spreads unknown props onto the element', () => {
    render(
      <Button data-testid="save-button" data-analytics="header-save">
        Save
      </Button>,
    );
    expect(screen.getByTestId('save-button')).toHaveAttribute('data-analytics', 'header-save');
  });

  it('forwards the ref to a real DOM node', () => {
    const ref = createRef<HTMLButtonElement>();
    render(<Button ref={ref}>Save</Button>);
    expect(ref.current).toBeInstanceOf(HTMLButtonElement);
  });

  it('renders as another element via `render`, keeping the anchor semantics', () => {
    render(<Button render={<a href="/pricing" />}>See pricing</Button>);
    const link = screen.getByRole('link', { name: 'See pricing' });
    expect(link).toHaveAttribute('href', '/pricing');
  });

  it('exposes state as data attributes for styling', () => {
    render(<Button variant="danger" size="lg">Delete</Button>);
    const button = screen.getByRole('button');
    expect(button).toHaveAttribute('data-variant', 'danger');
    expect(button).toHaveAttribute('data-size', 'lg');
  });
});

describe('Button — controlled/uncontrolled parity', () => {
  // Button has no internal state, but the pattern belongs in every stateful component's
  // suite: run the SAME assertions twice, once per mode. Wrappers that add a useState
  // break the controlled case, and this is what catches it.
  function ControlledExample() {
    const [count, setCount] = useState(0);
    return <Button onClick={() => setCount((c) => c + 1)}>Clicked {count}</Button>;
  }

  it('re-renders from external state', async () => {
    const user = userEvent.setup();
    render(<ControlledExample />);
    await user.click(screen.getByRole('button'));
    expect(screen.getByRole('button', { name: 'Clicked 1' })).toBeInTheDocument();
  });
});

describe('Button — accessibility', () => {
  it.each(VARIANTS)('%s variant has no axe violations', async (variant) => {
    const { container } = render(<Button variant={variant}>Save</Button>);
    expect(await axe(container)).toHaveNoViolations();
  });

  it('an icon-only button is named by its aria-label', () => {
    render(
      <Button aria-label="Dismiss notification">
        <svg aria-hidden="true" />
      </Button>,
    );
    expect(screen.getByRole('button', { name: 'Dismiss notification' })).toBeInTheDocument();
  });

  it('has no axe violations while loading', async () => {
    const { container } = render(<Button loading>Save</Button>);
    expect(await axe(container)).toHaveNoViolations();
  });

  /**
   * axe catches roughly 30–40% of WCAG issues. It cannot tell you whether the focus ORDER
   * is logical, whether an accessible name is USEFUL ("Button 3" passes), or whether an
   * error is announced when it appears. Those need explicit tests like the focus ones
   * above — and, at least once per release, a real screen-reader pass.
   */
});
