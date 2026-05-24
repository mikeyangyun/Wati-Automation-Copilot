// @vitest-environment happy-dom
import '@testing-library/jest-dom/vitest';

import { ReactFlow, ReactFlowProvider } from '@xyflow/react';
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import {
  FLOW_EDGE_TYPES,
  STAGGER_STEP,
  computeStaggerOffsetY,
  shouldRenderLabel,
} from './StaggeredEdge.js';

/**
 * The label-position math runs in user space (pixels around the edge
 * midpoint) and is the actual fix for the "labels pile up" bug shown in
 * user screenshots. We test it as a pure function — React Flow's edge
 * SVG paths are not actually rendered by happy-dom (path math needs a
 * real layout pass), so DOM-scraping the rendered transform would only
 * test happy-dom's quirks, not our logic.
 */
describe('computeStaggerOffsetY', () => {
  it('places a single sibling exactly on the midpoint (offset 0)', () => {
    // One-edge case = no stagger needed. The centre slot is offset 0 so
    // the label sits on the geometric midpoint, matching React Flow's
    // built-in placement (no surprise when only one edge exists).
    expect(computeStaggerOffsetY(0, 1)).toBe(0);
  });

  it('centres two siblings symmetrically around the midpoint', () => {
    // Two siblings → centre is 0.5 → offsets are -0.5 and +0.5 steps.
    expect(computeStaggerOffsetY(0, 2)).toBe(-STAGGER_STEP / 2);
    expect(computeStaggerOffsetY(1, 2)).toBe(STAGGER_STEP / 2);
  });

  it('places three siblings at [-STEP, 0, +STEP] — middle one anchored on midpoint', () => {
    expect(computeStaggerOffsetY(0, 3)).toBe(-STAGGER_STEP);
    expect(computeStaggerOffsetY(1, 3)).toBe(0);
    expect(computeStaggerOffsetY(2, 3)).toBe(STAGGER_STEP);
  });

  it('spreads four siblings across ±1.5 × STEP without any two sharing a Y', () => {
    // This is the exact configuration that produced the visible pile-up
    // in the user-reported screenshot (3 named branches + 1 fallback).
    // The contract: all four resulting Y offsets must be unique.
    const offsets = [0, 1, 2, 3].map((i) => computeStaggerOffsetY(i, 4));
    expect(offsets).toEqual([
      -1.5 * STAGGER_STEP,
      -0.5 * STAGGER_STEP,
      0.5 * STAGGER_STEP,
      1.5 * STAGGER_STEP,
    ]);
    expect(new Set(offsets).size).toBe(4);
  });

  it('preserves monotonicity: a larger siblingIndex always gives a larger Y offset', () => {
    // Guarantees deterministic ordering of labels along the y axis —
    // primary branches sit above the fallback (which has the largest
    // siblingIndex per the layout sort), reinforcing visual hierarchy.
    for (const count of [2, 3, 4, 5, 6]) {
      for (let i = 1; i < count; i += 1) {
        expect(computeStaggerOffsetY(i, count)).toBeGreaterThan(
          computeStaggerOffsetY(i - 1, count),
        );
      }
    }
  });
});

describe('shouldRenderLabel', () => {
  it('renders only non-empty strings — empty / undefined / non-string labels are skipped', () => {
    // Skipping the label DOM is what prevents the empty floating box we
    // used to see on unconditional edges (no `condition` on the source
    // `Edge`, so React Flow would otherwise still render an empty <div>).
    expect(shouldRenderLabel('Buyer')).toBe(true);
    expect(shouldRenderLabel('fallback')).toBe(true);
    expect(shouldRenderLabel('')).toBe(false);
    expect(shouldRenderLabel(undefined)).toBe(false);
    expect(shouldRenderLabel(null)).toBe(false);
    expect(shouldRenderLabel(0)).toBe(false);
    expect(shouldRenderLabel(['Buyer'])).toBe(false);
  });
});

describe('FLOW_EDGE_TYPES — React Flow integration smoke', () => {
  it('registers the staggered edge type and mounts cleanly inside <ReactFlow>', () => {
    // We can't assert the rendered SVG path / label DOM in happy-dom
    // (React Flow needs a real layout), but we CAN assert the registry
    // is structurally correct and the component renders without throwing
    // when fed by React Flow's internal store. This is a guardrail
    // against a future refactor breaking the public contract React Flow
    // relies on (the `staggered` key must remain the component reference).
    expect(FLOW_EDGE_TYPES.staggered).toBeDefined();
    expect(typeof FLOW_EDGE_TYPES.staggered).toBe('function');

    const { container } = render(
      <ReactFlowProvider>
        <div style={{ width: 600, height: 400 }}>
          <ReactFlow
            nodes={[
              { id: 'a', position: { x: 0, y: 0 }, data: {} },
              { id: 'b', position: { x: 200, y: 200 }, data: {} },
            ]}
            edges={[
              {
                id: 'e',
                source: 'a',
                target: 'b',
                type: 'staggered',
                label: 'Buyer',
                data: { siblingIndex: 0, siblingCount: 1, color: '#1f6feb' },
              },
            ]}
            edgeTypes={FLOW_EDGE_TYPES}
          />
        </div>
      </ReactFlowProvider>,
    );

    // The React Flow root mounted — proves the edge type was accepted.
    expect(container.querySelector('.react-flow')).not.toBeNull();
  });
});
