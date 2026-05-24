import { BaseEdge, getSmoothStepPath, type EdgeProps } from '@xyflow/react';

/**
 * Data payload that `FlowGraph` attaches to each edge. Co-located here so
 * the edge component and its producer share a single typed contract.
 *
 * Note: this file used to render condition labels inline on edges (the
 * original "staggered" behaviour). That visual was retired — Wati's own
 * builder draws labelless arrows and lets each `ask_question` node's
 * expected-replies chips carry the routing context — so this component
 * now only owns the stroke styling (colour + dashed-for-fallback). The
 * file name and exported symbols are kept to minimise the diff to
 * consumers; treat "Staggered" as historical.
 */
export interface StaggeredEdgeData {
  /** Stroke colour, inherited from the source node's type accent. */
  color: string;
  /**
   * Whether this is a fallback / catch-all edge. Rendered with a dashed
   * stroke so the primary branches read first — a low-noise way to
   * convey hierarchy without text.
   */
  fallback?: boolean;
  [key: string]: unknown;
}

/**
 * Read-only flow edge.
 *
 * - Uses `getSmoothStepPath` (the orthogonal shape Wati's own builder
 *   draws) so the wiring matches the rest of the product.
 * - Primary branches: solid line in the source-node's accent colour.
 * - Fallback branches: dashed + slightly muted so the eye groups
 *   primary branches first when a source fans out.
 * - No label DOM. Labels (the `condition` on each `Edge`) were
 *   producing a visible "pile-up" stripe on wide branching flows and
 *   diverged from Wati's actual product styling; users read branch
 *   semantics off the source `ask_question` card's chips instead.
 *   The underlying `condition` is still present in the flow JSON and
 *   surfaces in the JSON view, Explain output, and simulation traces —
 *   nothing about the data model changed, only the canvas rendering.
 */
export function StaggeredEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
  markerEnd,
}: EdgeProps) {
  const [edgePath] = getSmoothStepPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  const d = (data ?? {}) as Partial<StaggeredEdgeData>;
  const color = d.color ?? '#94a3b8';
  const isFallback = d.fallback === true;

  return (
    <BaseEdge
      id={id}
      path={edgePath}
      style={{
        stroke: color,
        strokeWidth: 1.5,
        ...(isFallback ? { strokeDasharray: '4 3', opacity: 0.85 } : {}),
      }}
      markerEnd={markerEnd}
    />
  );
}

/**
 * Edge-type registry handed to `<ReactFlow>`. Exported here so the
 * component and its consumer (`FlowGraph.tsx`) reference the same object
 * — React Flow recreates internal maps on identity change, so a stable
 * module-level constant is the right pattern.
 */
export const FLOW_EDGE_TYPES = { staggered: StaggeredEdge };
