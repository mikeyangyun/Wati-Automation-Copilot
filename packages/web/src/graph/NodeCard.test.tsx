// @vitest-environment happy-dom
import '@testing-library/jest-dom/vitest';

import { ReactFlowProvider } from '@xyflow/react';
import { render, screen } from '@testing-library/react';
import type { NodeType } from 'shared';
import { describe, expect, it } from 'vitest';

import { NodeCard, type NodeCardData } from './NodeCard.js';
import {
  formatWaitDuration,
  NODE_LABEL_MAX_CHARS,
  NODE_TYPE_STYLES,
  truncateLabel,
} from './nodeStyle.js';

const ALL_TYPES: NodeType[] = [
  'trigger',
  'send_message',
  'ask_question',
  'condition',
  'assign_to_team',
  'api_call',
  'wait',
];

/**
 * Render a NodeCard with the minimal props React Flow expects from a custom
 * node. We don't go through `<ReactFlow>` because we only care about the
 * card's own DOM, not the flow surface.
 */
function renderCard(data: Partial<NodeCardData> & { type: NodeType; label: string }) {
  return render(
    <ReactFlowProvider>
      <NodeCard
        id="n_test"
        type={data.type}
        data={data}
        selected={false}
        isConnectable={false}
        positionAbsoluteX={0}
        positionAbsoluteY={0}
        zIndex={0}
        dragging={false}
        draggable={false}
        selectable={false}
        deletable={false}
      />
    </ReactFlowProvider>,
  );
}

describe('NODE_TYPE_STYLES — palette completeness', () => {
  it('covers every NodeType with all required fields', () => {
    for (const type of ALL_TYPES) {
      const style = NODE_TYPE_STYLES[type];
      expect(style.emoji.length).toBeGreaterThan(0);
      expect(style.displayName.length).toBeGreaterThan(0);
      expect(style.headerBg).toMatch(/^#[0-9a-fA-F]{6}$/);
      expect(style.headerText).toMatch(/^#[0-9a-fA-F]{6}$/);
      expect(style.accent).toMatch(/^#[0-9a-fA-F]{6}$/);
    }
  });

  it('uses distinct accent colors per type (no accidental palette duplication)', () => {
    const accents = ALL_TYPES.map((t) => NODE_TYPE_STYLES[t].accent);
    expect(new Set(accents).size).toBe(accents.length);
  });

  it('uses distinct displayNames per type so designers can identify nodes by header', () => {
    const names = ALL_TYPES.map((t) => NODE_TYPE_STYLES[t].displayName);
    expect(new Set(names).size).toBe(names.length);
  });
});

describe('truncateLabel', () => {
  it('returns the input unchanged when below the cap', () => {
    expect(truncateLabel('short label')).toBe('short label');
  });

  it('truncates with an ellipsis when above the cap', () => {
    const long = 'a'.repeat(NODE_LABEL_MAX_CHARS + 10);
    const result = truncateLabel(long);
    expect(result.endsWith('…')).toBe(true);
    expect(result.length).toBe(NODE_LABEL_MAX_CHARS);
  });

  it('trims trailing whitespace before the ellipsis', () => {
    const input = `${'a'.repeat(NODE_LABEL_MAX_CHARS - 2)}   trailing`;
    const result = truncateLabel(input);
    expect(result.endsWith(' …')).toBe(false);
  });
});

describe('formatWaitDuration', () => {
  it('renders < 1s as milliseconds', () => {
    expect(formatWaitDuration(0)).toBe('0 ms');
    expect(formatWaitDuration(750)).toBe('750 ms');
  });

  it('renders < 1min as seconds, integer when whole', () => {
    expect(formatWaitDuration(2000)).toBe('2 s');
    expect(formatWaitDuration(2500)).toBe('2.5 s');
  });

  it('renders < 1h as minutes', () => {
    expect(formatWaitDuration(180_000)).toBe('3 min');
    expect(formatWaitDuration(90_000)).toBe('1.5 min');
  });

  it('renders >= 1h as hours', () => {
    expect(formatWaitDuration(3_600_000)).toBe('1 h');
    expect(formatWaitDuration(9_000_000)).toBe('2.5 h');
  });
});

describe('NodeCard — header rendering (Wati-style)', () => {
  it.each(ALL_TYPES)('renders the colored header with displayName + icon for %s', (type) => {
    renderCard({ type, label: 'Test' });
    const card = document.querySelector(`[data-node-type="${type}"]`) as HTMLElement;
    expect(card).toBeInTheDocument();

    const style = NODE_TYPE_STYLES[type];
    const header = card.querySelector('.node-header') as HTMLElement | null;
    expect(header).not.toBeNull();
    // Header text contains the type display name.
    expect(header!.textContent).toContain(style.displayName);
    // Emoji icon is rendered inside the header.
    expect(header!.textContent).toContain(style.emoji);
  });

  it('renders the LLM-assigned label as a subtitle in the body', () => {
    renderCard({ type: 'send_message', label: 'Welcome message' });
    const label = document.querySelector('.node-label');
    expect(label).not.toBeNull();
    expect(label!.textContent).toBe('Welcome message');
  });

  it('truncates long labels and exposes the full label via title attribute', () => {
    const long = 'This label is intentionally far too long to fit inside a node card';
    renderCard({ type: 'send_message', label: long });
    const truncated = truncateLabel(long);
    expect(truncated).not.toBe(long);
    expect(truncated.endsWith('…')).toBe(true);
    const labelEl = document.querySelector('.node-label')!;
    expect(labelEl.textContent).toBe(truncated);
    expect(labelEl).toHaveAttribute('title', long);
  });
});

describe('NodeCard — per-type body content', () => {
  it('trigger: renders a Starting step badge', () => {
    renderCard({ type: 'trigger', label: 'Entry', config: {} });
    expect(screen.getByText(/starting step/i)).toBeInTheDocument();
  });

  it('send_message: renders the configured text preview', () => {
    renderCard({
      type: 'send_message',
      label: 'Greeting',
      config: { text: 'Hi {{name}}, welcome to Product Academy!' },
    });
    expect(screen.getByText(/welcome to product academy/i)).toBeInTheDocument();
  });

  it('ask_question: renders the question and chip options up to the inline limit', () => {
    renderCard({
      type: 'ask_question',
      label: 'Department',
      config: {
        text: 'Which department?',
        expectedReplies: ['Billing', 'Technical Support', 'Sales', 'General Inquiry'],
      },
    });
    expect(screen.getByText('Which department?')).toBeInTheDocument();
    for (const reply of ['Billing', 'Technical Support', 'Sales', 'General Inquiry']) {
      expect(screen.getByText(reply)).toBeInTheDocument();
    }
    // No overflow indicator when exactly at the limit.
    expect(screen.queryByText(/\+\d+ more/i)).not.toBeInTheDocument();
  });

  it('ask_question: collapses extra options into a "+N more" chip', () => {
    renderCard({
      type: 'ask_question',
      label: 'Department',
      config: {
        text: 'Which?',
        expectedReplies: ['A', 'B', 'C', 'D', 'E', 'F'],
      },
    });
    // First four are visible.
    for (const reply of ['A', 'B', 'C', 'D']) {
      expect(screen.getByText(reply)).toBeInTheDocument();
    }
    // E / F collapsed into the overflow indicator.
    expect(screen.queryByText('E')).not.toBeInTheDocument();
    expect(screen.queryByText('F')).not.toBeInTheDocument();
    expect(screen.getByText('+2 more')).toBeInTheDocument();
  });

  it('assign_to_team: renders the team name with a "Team:" prefix', () => {
    renderCard({
      type: 'assign_to_team',
      label: 'Route',
      config: { team: 'Billing Team' },
    });
    const team = document.querySelector('.node-team');
    expect(team).not.toBeNull();
    expect(team!.textContent).toMatch(/team:.*billing team/i);
  });

  it('api_call: renders the METHOD badge + URL', () => {
    renderCard({
      type: 'api_call',
      label: 'Save lead',
      config: { method: 'POST', url: 'https://example.com/leads' },
    });
    expect(screen.getByText('POST')).toBeInTheDocument();
    expect(screen.getByText('https://example.com/leads')).toBeInTheDocument();
  });

  it('wait: renders a human-readable duration', () => {
    renderCard({ type: 'wait', label: 'Delay', config: { durationMs: 90_000 } });
    expect(screen.getByText(/wait 1\.5 min/i)).toBeInTheDocument();
  });

  it('condition: shows a "Branch logic" hint when there is no config', () => {
    renderCard({ type: 'condition', label: 'Pick path', config: {} });
    expect(screen.getByText(/branch logic/i)).toBeInTheDocument();
  });

  it('survives missing config without throwing (defensive fallback)', () => {
    // Config is intentionally undefined — some test paths omit it. The card
    // should still render the header + label, just no body content.
    expect(() => renderCard({ type: 'send_message', label: 'Untitled' })).not.toThrow();
  });
});

describe('NodeCard — selection / highlight state', () => {
  it('applies the selected attribute and a colored glow when selected', () => {
    renderCard({
      type: 'ask_question',
      label: 'Ask',
      selected: true,
      selectedSeverity: 'error',
    });
    const card = document.querySelector('[data-node-type="ask_question"]') as HTMLElement;
    expect(card).toHaveAttribute('data-selected', 'true');
    expect(card.style.boxShadow).toContain('220, 38, 38');
  });

  it('dims the card when `dimmed === true` (unrelated to current selection)', () => {
    renderCard({ type: 'send_message', label: 'Other', dimmed: true });
    const card = document.querySelector('[data-node-type="send_message"]') as HTMLElement;
    expect(card.style.opacity).toBe('0.45');
  });

  it('uses the info-blue glow when severity is omitted', () => {
    renderCard({ type: 'trigger', label: 'Start', selected: true });
    const card = document.querySelector('[data-node-type="trigger"]') as HTMLElement;
    expect(card.style.boxShadow).toContain('59, 130, 246');
  });
});
