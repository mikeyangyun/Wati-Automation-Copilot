// @vitest-environment happy-dom
import '@testing-library/jest-dom/vitest';

import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Stepper } from './Stepper.js';

describe('Stepper', () => {
  it('renders one item per step in order with the label and 1-based index', () => {
    render(
      <Stepper
        steps={[
          { label: 'Describe', state: 'active' },
          { label: 'Flow', state: 'pending' },
          { label: 'Test', state: 'pending' },
        ]}
      />,
    );
    const items = screen.getAllByRole('listitem');
    expect(items).toHaveLength(3);
    expect(items[0]).toHaveTextContent('Describe');
    expect(items[0]).toHaveTextContent('1');
    expect(items[1]).toHaveTextContent('Flow');
    expect(items[1]).toHaveTextContent('2');
    expect(items[2]).toHaveTextContent('Test');
    expect(items[2]).toHaveTextContent('3');
  });

  it('marks the active step with aria-current="step" for assistive tech', () => {
    render(
      <Stepper
        steps={[
          { label: 'Describe', state: 'done' },
          { label: 'Flow', state: 'active' },
          { label: 'Test', state: 'pending' },
        ]}
      />,
    );
    // Exactly one step should be aria-current.
    const active = screen.getByTestId('stepper-item-2');
    expect(active).toHaveAttribute('aria-current', 'step');
    expect(screen.getByTestId('stepper-item-1')).not.toHaveAttribute('aria-current');
    expect(screen.getByTestId('stepper-item-3')).not.toHaveAttribute('aria-current');
  });

  it('replaces the index disc with a check mark for done steps', () => {
    render(
      <Stepper
        steps={[
          { label: 'Describe', state: 'done' },
          { label: 'Flow', state: 'active' },
          { label: 'Test', state: 'pending' },
        ]}
      />,
    );
    const done = screen.getByTestId('stepper-item-1');
    // The numeric "1" must NOT appear inside the done disc — it has been
    // replaced by the SVG check icon. We assert structurally to avoid
    // coupling to the exact path data.
    const disc = done.querySelector('.stepper-disc');
    expect(disc).not.toBeNull();
    expect(disc!.querySelector('svg')).not.toBeNull();
    expect(disc!.textContent ?? '').not.toMatch(/^1$/);
  });

  it('does not render a connector after the last item', () => {
    const { container } = render(
      <Stepper
        steps={[
          { label: 'Describe', state: 'done' },
          { label: 'Flow', state: 'done' },
          { label: 'Test', state: 'active' },
        ]}
      />,
    );
    // 3 steps → at most 2 connectors. Anchoring this prevents a regression
    // where a trailing connector leaves a "to nowhere" line on the right.
    expect(container.querySelectorAll('.stepper-connector')).toHaveLength(2);
  });

  it('applies a per-state class on each item for CSS hooks', () => {
    render(
      <Stepper
        steps={[
          { label: 'Describe', state: 'done' },
          { label: 'Flow', state: 'active' },
          { label: 'Test', state: 'pending' },
        ]}
      />,
    );
    expect(screen.getByTestId('stepper-item-1')).toHaveClass('stepper-item-done');
    expect(screen.getByTestId('stepper-item-2')).toHaveClass('stepper-item-active');
    expect(screen.getByTestId('stepper-item-3')).toHaveClass('stepper-item-pending');
  });
});
