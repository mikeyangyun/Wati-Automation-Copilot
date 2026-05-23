// @vitest-environment happy-dom
import '@testing-library/jest-dom/vitest';

import { ReactFlowProvider } from '@xyflow/react';
import { render, screen } from '@testing-library/react';
import type { NodeType } from 'shared';
import { describe, expect, it } from 'vitest';

import { NodeCard, type NodeCardData } from './NodeCard.js';
import { NODE_LABEL_MAX_CHARS, NODE_TYPE_STYLES, truncateLabel } from './nodeStyle.js';

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
  // ReactFlowProvider is needed because <Handle> reads from the React Flow
  // context. Without it Handle throws.
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
      expect(style.accent).toMatch(/^#[0-9a-fA-F]{6}$/);
      expect(style.surface).toMatch(/^#[0-9a-fA-F]{6}$/);
      expect(style.chipLabel.length).toBeGreaterThan(0);
    }
  });

  it('uses distinct accent colors per type (no accidental palette duplication)', () => {
    const accents = ALL_TYPES.map((t) => NODE_TYPE_STYLES[t].accent);
    expect(new Set(accents).size).toBe(accents.length);
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

describe('NodeCard — per-type rendering', () => {
  it.each(ALL_TYPES)('renders the right emoji + chip + accent border for %s', (type) => {
    renderCard({ type, label: 'Test' });
    const card = document.querySelector(`[data-node-type="${type}"]`)!;
    expect(card).toBeInTheDocument();

    const style = NODE_TYPE_STYLES[type];
    expect(card.textContent).toContain(style.emoji);
    expect(card.textContent).toContain(style.chipLabel);
    expect((card as HTMLElement).style.borderLeftColor).toBeTruthy();
  });

  it('renders the label as-is when short and omits the title tooltip', () => {
    renderCard({ type: 'send_message', label: 'Hello there' });
    const label = screen.getByText('Hello there');
    expect(label).not.toHaveAttribute('title');
  });

  it('truncates long labels and exposes the full label via `title`', () => {
    const long = 'This label is intentionally far too long to fit inside a node card';
    renderCard({ type: 'send_message', label: long });
    // The visible text is truncated with an ellipsis.
    const truncated = truncateLabel(long);
    expect(truncated).not.toBe(long);
    expect(truncated.endsWith('…')).toBe(true);
    const labelEl = document.querySelector('.node-label')!;
    expect(labelEl.textContent).toBe(truncated);
    expect(labelEl).toHaveAttribute('title', long);
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
    expect(card.style.boxShadow).toContain('220, 38, 38'); // red glow
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
