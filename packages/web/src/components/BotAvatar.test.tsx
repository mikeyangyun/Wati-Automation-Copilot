// @vitest-environment happy-dom
import '@testing-library/jest-dom/vitest';

import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { BotAvatar } from './BotAvatar.js';

describe('BotAvatar', () => {
  it('renders the face SVG and is marked as decorative', () => {
    render(<BotAvatar />);
    const wrapper = screen.getByTestId('bot-avatar');
    // The whole avatar is decorative — meaning is carried by the
    // adjacent "Online / Idle" label, not by the picture.
    expect(wrapper.getAttribute('aria-hidden')).toBe('true');
    // The SVG itself is inside the wrapper.
    expect(wrapper.querySelector('svg')).not.toBeNull();
  });

  it('omits the online presence dot when offline', () => {
    const { container } = render(<BotAvatar />);
    expect(container.querySelector('.bot-avatar-dot')).toBeNull();
    expect(container.querySelector('.bot-avatar-online')).toBeNull();
  });

  it('shows the WhatsApp-green presence dot when online', () => {
    const { container } = render(<BotAvatar online />);
    // Both the wrapper modifier (for the static class) and the explicit
    // dot element must be present, so CSS hooks land regardless of which
    // selector a designer wires up.
    expect(container.querySelector('.bot-avatar-online')).not.toBeNull();
    expect(container.querySelector('.bot-avatar-dot')).not.toBeNull();
  });

  it('respects a custom size on both wrapper and svg', () => {
    const { container } = render(<BotAvatar size={40} />);
    const wrapper = screen.getByTestId('bot-avatar') as HTMLElement;
    expect(wrapper.style.width).toBe('40px');
    expect(wrapper.style.height).toBe('40px');
    const svg = container.querySelector('svg')!;
    expect(svg.getAttribute('width')).toBe('40');
    expect(svg.getAttribute('height')).toBe('40');
  });
});
