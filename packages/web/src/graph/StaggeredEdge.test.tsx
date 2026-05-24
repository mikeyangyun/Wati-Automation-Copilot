// @vitest-environment happy-dom
import '@testing-library/jest-dom/vitest';

import { ReactFlow, ReactFlowProvider } from '@xyflow/react';
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { FLOW_EDGE_TYPES, StaggeredEdge } from './StaggeredEdge.js';

/**
 * The custom edge currently exists only to (a) recolour the stroke per
 * source-node type and (b) dash fallback edges. There's no math left to
 * unit-test (the previous stagger helpers were retired with the on-edge
 * labels), so we cover the two contracts the rest of the app actually
 * depends on: the registry exposes the component under the `staggered`
 * key, and React Flow can mount it without throwing.
 *
 * happy-dom doesn't run React Flow's SVG layout pass, so DOM-scraping the
 * rendered path / colour would only test happy-dom's quirks rather than
 * our intent — we explicitly stop at "the registry shape is correct" and
 * "mounting an edge of this type doesn't blow up".
 */
describe('FLOW_EDGE_TYPES — React Flow integration smoke', () => {
  it('exposes the staggered edge component under the registry key React Flow expects', () => {
    expect(FLOW_EDGE_TYPES.staggered).toBe(StaggeredEdge);
    expect(typeof FLOW_EDGE_TYPES.staggered).toBe('function');
  });

  it('mounts cleanly inside <ReactFlow> with a fallback edge data payload', () => {
    // Smoke test: this is the configuration `FlowGraph` produces — `data`
    // carries the colour + fallback flag the renderer reads. A regression
    // in `StaggeredEdgeData`'s shape (e.g. dropping `color`) would surface
    // here as a throw from React Flow's strict prop pipeline.
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
                data: { color: '#1f6feb', fallback: true },
              },
            ]}
            edgeTypes={FLOW_EDGE_TYPES}
          />
        </div>
      </ReactFlowProvider>,
    );

    expect(container.querySelector('.react-flow')).not.toBeNull();
  });
});
