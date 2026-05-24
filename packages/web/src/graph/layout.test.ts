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

  it('annotates each edge with siblingIndex / siblingCount so labels can be staggered', () => {
    const flow = flowFixture();
    const { edges } = computeLayout(flow);
    // n_start has one outgoing edge → siblingCount 1, siblingIndex 0.
    const fromStart = edges.find((e) => e.source === 'n_start')!;
    expect(fromStart.siblingCount).toBe(1);
    expect(fromStart.siblingIndex).toBe(0);
    // n_ask has three outgoing edges (buy, sell, default-unconditional) →
    // siblingCount 3 on each, indices 0/1/2 covering the full set without
    // gaps or duplicates.
    const fromAsk = edges.filter((e) => e.source === 'n_ask');
    expect(fromAsk).toHaveLength(3);
    for (const e of fromAsk) {
      expect(e.siblingCount).toBe(3);
    }
    expect(fromAsk.map((e) => e.siblingIndex).sort()).toEqual([0, 1, 2]);
  });

  it('places fallback edges at the highest siblingIndex (rightmost slot) per source', () => {
    // The deterministic sort that drives layout puts named branches before
    // fallback; the same ordering is what siblingIndex now exposes to the
    // edge renderer. Asserting it here protects the visual stagger contract
    // — fallback labels are always rendered at the bottom of the stagger
    // band, consistent with their semantic "catch-all" role.
    const flow: Flow = {
      ...flowFixture(),
      edges: [
        { id: 'e0', from: 'n_start', to: 'n_ask' },
        { id: 'e_buy', from: 'n_ask', to: 'n_sales', condition: 'buyer' },
        { id: 'e_sell', from: 'n_ask', to: 'n_support', condition: 'seller' },
        { id: 'e_fb', from: 'n_ask', to: 'n_fallback', condition: 'fallback' },
      ],
    };
    const { edges } = computeLayout(flow);
    const fb = edges.find((e) => e.id === 'e_fb')!;
    const buy = edges.find((e) => e.id === 'e_buy')!;
    const sell = edges.find((e) => e.id === 'e_sell')!;
    expect(fb.siblingIndex).toBeGreaterThan(buy.siblingIndex);
    expect(fb.siblingIndex).toBeGreaterThan(sell.siblingIndex);
    // And it's the last slot, not a gap in the middle.
    expect(fb.siblingIndex).toBe(2);
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

describe('computeLayout — branch ordering (fewer crossings)', () => {
  /**
   * Wide-branch fixture that mirrors the real LLM output that previously
   * produced crossing edges: two parallel ask_question subtrees, each with
   * 3 named branches plus a fallback, all reaching their own destinations
   * one rank below. The crossings only surface when dagre's tie-break
   * puts a sibling subtree's destination between two of *this* subtree's
   * destinations — pinning the insertion order tames that.
   */
  function wideBranchFlow(): Flow {
    return {
      id: 'flow_wide',
      name: 'Insurance routing',
      prompt: 'route home and auto sub-questions',
      trigger: { type: 'new_message' },
      entryNodeId: 'n_start',
      nodes: [
        { id: 'n_start', type: 'trigger', label: 'Start', config: {} },
        {
          id: 'n_top',
          type: 'ask_question',
          label: 'Home or auto?',
          config: { text: 'Which line?', expectedReplies: ['Home', 'Auto'] },
        },
        {
          id: 'n_home',
          type: 'ask_question',
          label: 'Home type',
          config: { text: 'Which?', expectedReplies: ['House', 'Apartment', 'Condo'] },
        },
        {
          id: 'n_auto',
          type: 'ask_question',
          label: 'Auto type',
          config: { text: 'Which?', expectedReplies: ['Sedan', 'SUV', 'Truck', 'Motorcycle'] },
        },
        // Six leaf destinations, one per branch.
        { id: 'n_house', type: 'send_message', label: 'House', config: { text: 'h' } },
        { id: 'n_apt', type: 'send_message', label: 'Apt', config: { text: 'a' } },
        { id: 'n_condo', type: 'send_message', label: 'Condo', config: { text: 'c' } },
        { id: 'n_sedan', type: 'send_message', label: 'Sedan', config: { text: 's' } },
        { id: 'n_suv', type: 'send_message', label: 'SUV', config: { text: 'v' } },
        { id: 'n_truck', type: 'send_message', label: 'Truck', config: { text: 't' } },
        { id: 'n_moto', type: 'send_message', label: 'Moto', config: { text: 'm' } },
        // One shared fallback so the deterministic-fallback-last assertion has
        // edges to compare across two sources.
        { id: 'n_fb', type: 'send_message', label: 'Fallback', config: { text: 'f' } },
      ],
      edges: [
        { id: 'e0', from: 'n_start', to: 'n_top' },
        { id: 'e_home_branch', from: 'n_top', to: 'n_home', condition: 'Home' },
        { id: 'e_auto_branch', from: 'n_top', to: 'n_auto', condition: 'Auto' },
        { id: 'e_top_fb', from: 'n_top', to: 'n_fb', condition: 'fallback' },
        // Intentionally pass the children in a NON-sorted, fallback-first order
        // so the test proves `computeLayout` re-sorts internally rather than
        // relying on the caller to do it.
        { id: 'e_home_fb', from: 'n_home', to: 'n_fb', condition: 'fallback' },
        { id: 'e_home_condo', from: 'n_home', to: 'n_condo', condition: 'Condo' },
        { id: 'e_home_house', from: 'n_home', to: 'n_house', condition: 'House' },
        { id: 'e_home_apt', from: 'n_home', to: 'n_apt', condition: 'Apartment' },
        { id: 'e_auto_fb', from: 'n_auto', to: 'n_fb', condition: 'fallback' },
        { id: 'e_auto_moto', from: 'n_auto', to: 'n_moto', condition: 'Motorcycle' },
        { id: 'e_auto_truck', from: 'n_auto', to: 'n_truck', condition: 'Truck' },
        { id: 'e_auto_suv', from: 'n_auto', to: 'n_suv', condition: 'SUV' },
        { id: 'e_auto_sedan', from: 'n_auto', to: 'n_sedan', condition: 'Sedan' },
      ],
      createdAt: '2026-05-23T10:00:00Z',
    };
  }

  it('keeps each ask_question subtree visually grouped (no inter-subtree leaf interleaving)', () => {
    // The strongest crossing-free invariant we can assert deterministically:
    // each ask_question's leaves stay contiguous along x — no leaf from the
    // OTHER subtree ever lands between two leaves of THIS subtree. Which
    // subtree ends up on which side depends on dagre's barycenter pass
    // (a stable function of insertion order), so we assert "grouped",
    // not "home is on the left".
    const { nodes } = computeLayout(wideBranchFlow());
    const xOf = (id: string) => nodes.find((n) => n.id === id)!.position.x;
    const homeXs = [xOf('n_house'), xOf('n_apt'), xOf('n_condo')];
    const autoXs = [xOf('n_sedan'), xOf('n_suv'), xOf('n_truck'), xOf('n_moto')];
    const homeMax = Math.max(...homeXs);
    const homeMin = Math.min(...homeXs);
    const autoMax = Math.max(...autoXs);
    const autoMin = Math.min(...autoXs);
    // One subtree must be entirely to the left of (or right of) the other —
    // any overlap means an edge crossing.
    const grouped = homeMax < autoMin || autoMax < homeMin;
    expect(grouped).toBe(true);
  });

  it('does not interleave the fallback target between any two named branches of a single source', () => {
    // The shared fallback's exact X depends on dagre (it's pulled toward the
    // barycenter of its two sources). What MUST hold: it never lands between
    // two named children of the same source — which would re-introduce a
    // crossing equivalent to the bug this whole fix targets.
    const { nodes } = computeLayout(wideBranchFlow());
    const xOf = (id: string) => nodes.find((n) => n.id === id)!.position.x;
    const fbX = xOf('n_fb');

    // Per source, fallback must lie outside the [min, max] of the named
    // siblings' X positions. Assert for both n_home and n_auto.
    const homeNamedXs = [xOf('n_house'), xOf('n_apt'), xOf('n_condo')];
    expect(fbX < Math.min(...homeNamedXs) || fbX > Math.max(...homeNamedXs)).toBe(true);

    const autoNamedXs = [xOf('n_sedan'), xOf('n_suv'), xOf('n_truck'), xOf('n_moto')];
    expect(fbX < Math.min(...autoNamedXs) || fbX > Math.max(...autoNamedXs)).toBe(true);
  });
});

describe('computeLayout — determinism', () => {
  it('produces identical output for identical input across two invocations', () => {
    const a = computeLayout(flowFixture());
    const b = computeLayout(flowFixture());
    expect(a).toEqual(b);
  });

  it('produces identical output regardless of incoming edge order (sort is internal)', () => {
    // Same logical flow, edges shuffled. The internal sort means the layout
    // (positions + edge list contents) is identical.
    const base = flowFixture();
    const shuffled: Flow = { ...base, edges: [...base.edges].reverse() };
    const a = computeLayout(base);
    const b = computeLayout(shuffled);
    // Positions are identical.
    expect(a.nodes).toEqual(b.nodes);
    // Edge sets are identical (order can differ because output preserves
    // the caller's input order, but content + count must match).
    const norm = (es: { id: string }[]) => [...es].sort((x, y) => x.id.localeCompare(y.id));
    expect(norm(a.edges)).toEqual(norm(b.edges));
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
