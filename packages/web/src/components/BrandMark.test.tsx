// @vitest-environment happy-dom
import '@testing-library/jest-dom/vitest';

import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { BrandMark } from './BrandMark.js';

describe('BrandMark', () => {
  it('renders as decorative (aria-hidden, no role) when no label is given', () => {
    const { container } = render(<BrandMark />);
    const svg = container.querySelector('svg.brand-mark');
    expect(svg).not.toBeNull();
    // Decorative mode: no role="img" and aria-hidden="true". Crucial so
    // the header doesn't double-announce the title (the H1 carries the
    // accessible name already).
    expect(svg!.getAttribute('aria-hidden')).toBe('true');
    expect(svg!.getAttribute('role')).toBeNull();
    expect(svg!.getAttribute('focusable')).toBe('false');
  });

  it('renders as a labeled image when a label is provided', () => {
    render(<BrandMark label="Copilot logo" />);
    // role="img" makes the svg discoverable to screen readers and the
    // a11y query API; the label becomes the accessible name.
    const svg = screen.getByRole('img', { name: 'Copilot logo' });
    expect(svg).toBeInTheDocument();
    expect(svg.getAttribute('aria-hidden')).toBeNull();
  });

  it('honours a custom size on width / height (but keeps the viewBox)', () => {
    const { container } = render(<BrandMark size={64} />);
    const svg = container.querySelector('svg.brand-mark')!;
    expect(svg.getAttribute('width')).toBe('64');
    expect(svg.getAttribute('height')).toBe('64');
    // viewBox stays fixed so the artwork scales uniformly.
    expect(svg.getAttribute('viewBox')).toBe('0 0 36 36');
  });
});
