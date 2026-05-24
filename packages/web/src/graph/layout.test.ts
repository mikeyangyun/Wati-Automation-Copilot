import type { Flow } from 'shared';
import { describe, expect, it } from 'vitest';

import { NODE_HEIGHT, NODE_WIDTH, computeLayout } from './layout.js';

function flowFixture(): Flow {
  return {
    id: 'flow_layout',
    name: 'Buyer / Seller',
    prompt: 'route buyers and sellers',
    trigger: { type: 'new_message' },
    entryNodeId: 'n_start',
    nodes: [
      { id: 'n_start', type: 'trigger', label: 'Start', config: {} },
      {
        id: 'n_ask',
        type: 'ask_question',
        label: 'Ask buyer / seller',
        config: { text: 'Buyer or seller?' },
      },
      { id: 'n_sales', type: 'assign_to_team', label: 'Sales', config: { team: 'Sales' } },
      { id: 'n_support', type: 'send_message', label: 'Support', config: { text: 'hi' } },
      {
        id: 'n_fallback',
        type: 'assign_to_team',
        label: 'Fallback',
        config: { team: 'Support' },
      },
    ],
    edges: [
      { id: 'e0', from: 'n_start', to: 'n_ask' },
      { id: 'e_buy', from: 'n_ask', to: 'n_sales', condition: 'buyer' },
      { id: 'e_sell', from: 'n_ask', to: 'n_support', condition: 'seller' },
      { id: 'e_def', from: 'n_ask', to: 'n_fallback' },
    ],
    createdAt: '2026-05-23T10:00:00Z',
  };
}

describe('computeLayout — basic behaviour', () => {
  it('returns empty arrays for a flow with no nodes', () => {
    const flow: Flow = { ...flowFixture(), nodes: [], edges: [] };
    expect(computeLayout(flow)).toEqual({ nodes: [], edges: [] });
  });

  it('returns one positioned node per input node, preserving id / type / label / config', () => {
    const flow = flowFixture();
    const result = computeLayout(flow);
    expect(result.nodes).toHaveLength(flow.nodes.length);
    for (const original of flow.nodes) {
      const placed = result.nodes.find((n) => n.id === original.id);
      expect(placed).toBeDefined();
      expect(placed!.type).toBe(original.type);
      expect(placed!.label).toBe(original.label);
      expect(placed!.config).toEqual(original.config);
    }
  });

  it('emits top-left positions, not center (so React Flow consumes them directly)', () => {
    const flow = flowFixture();
    const result = computeLayout(flow);
    // For a non-empty layout, dagre places the first node above zero. After
    // converting center→top-left, the trigger node should still be non-negative.
    const trigger = result.nodes.find((n) => n.id === 'n_start')!;
    expect(trigger.position.x).toBeGreaterThanOrEqual(0);
    expect(trigger.position.y).toBeGreaterThanOrEqual(0);
  });

  it('places the trigger above the ask node (top-down rank direction)', () => {
    const flow = flowFixture();
    const { nodes } = computeLayout(flow);
    const start = nodes.find((n) => n.id === 'n_start')!;
    const ask = nodes.find((n) => n.id === 'n_ask')!;
    expect(start.position.y).toBeLessThan(ask.position.y);
  });

  it('places sibling branch targets at roughly the same y (one rank below the ask node)', () => {
    const flow = flowFixture();
    const { nodes } = computeLayout(flow);
    const sales = nodes.find((n) => n.id === 'n_sales')!;
    const support = nodes.find((n) => n.id === 'n_support')!;
    const fallback = nodes.find((n) => n.id === 'n_fallback')!;
    expect(sales.position.y).toBe(support.position.y);
    expect(support.position.y).toBe(fallback.position.y);
  });

  it('separates sibling x positions by more than a node width (no overlap)', () => {
    const flow = flowFixture();
    const { nodes } = computeLayout(flow);
    const sales = nodes.find((n) => n.id === 'n_sales')!;
    const support = nodes.find((n) => n.id === 'n_support')!;
    expect(Math.abs(sales.position.x - support.position.x)).toBeGreaterThan(NODE_WIDTH);
  });
});

describe('computeLayout — edges', () => {
  it('emits one layout edge per input edge with condition label preserved', () => {
    const flow = flowFixture();
    const { edges } = computeLayout(flow);
    expect(edges).toHaveLength(4);
    const buy = edges.find((e) => e.id === 'e_buy')!;
    expect(buy.label).toBe('buyer');
    expect(buy.source).toBe('n_ask');
    expect(buy.target).toBe('n_sales');

    const def = edges.find((e) => e.id === 'e_def')!;
    expect(def.label).toBeUndefined();
  });

  it('silently drops edges whose endpoints are missing (caller already warns)', () => {
    const flow: Flow = {
      ...flowFixture(),
      edges: [
        ...flowFixture().edges,
        { id: 'e_dangling', from: 'n_start', to: 'n_ghost' },
        { id: 'e_dangling2', from: 'n_phantom', to: 'n_sales' },
      ],
    };
    const { edges } = computeLayout(flow);
    expect(edges.map((e) => e.id)).not.toContain('e_dangling');
    expect(edges.map((e) => e.id)).not.toContain('e_dangling2');
    expect(edges).toHaveLength(4);
  });
});

describe('computeLayout — determinism', () => {
  it('produces identical output for identical input across two invocations', () => {
    const a = computeLayout(flowFixture());
    const b = computeLayout(flowFixture());
    expect(a).toEqual(b);
  });

  it('reserves the same node box size regardless of label length', () => {
    const short = computeLayout(flowFixture());
    const longLabel = 'A very very very long label that should not change positions';
    const longFlow: Flow = {
      ...flowFixture(),
      nodes: flowFixture().nodes.map((n) => (n.id === 'n_ask' ? { ...n, label: longLabel } : n)),
    };
    const long = computeLayout(longFlow);
    // n_ask center position should not depend on label length because layout
    // is driven by NODE_WIDTH/NODE_HEIGHT constants.
    const shortAsk = short.nodes.find((n) => n.id === 'n_ask')!;
    const longAsk = long.nodes.find((n) => n.id === 'n_ask')!;
    expect(shortAsk.position).toEqual(longAsk.position);
    // Sanity: the size constants are visible for the consumer. Width/height
    // were bumped to accommodate the Wati-style colored header + per-type
    // body — see `nodeStyle.ts` and `NodeCard.tsx`.
    expect(NODE_WIDTH).toBe(280);
    expect(NODE_HEIGHT).toBe(160);
  });
});
