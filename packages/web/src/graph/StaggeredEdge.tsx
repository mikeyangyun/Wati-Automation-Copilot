import { BaseEdge, EdgeLabelRenderer, getSmoothStepPath, type EdgeProps } from '@xyflow/react';

/**
 * Data payload that `FlowGraph` attaches to each edge. Co-located here so
 * the edge component and its producer share a single typed contract.
 */
export interface StaggeredEdgeData {
  /** 0-based position among edges that share this edge's source. */
  siblingIndex: number;
  /** Total edges from the same source. Used to centre the stagger band. */
  siblingCount: number;
  /** Stroke + label foreground colour (inherits the source node's accent). */
  color: string;
  /**
   * Whether this is a fallback edge — rendered with a dashed stroke and a
   * slightly subdued label background so primary branches read first.
   */
  fallback?: boolean;
  [key: string]: unknown;
}

/**
 * Vertical pixel step between adjacent sibling label boxes. Chosen so a
 * single line of edge text (font-size 11, padding ~2 px → ~17 px tall)
 * has visible breathing room between rows: 14 px keeps adjacent slots
 * non-overlapping while still feeling tightly grouped on the edge.
 */
export const STAGGER_STEP = 14;

/**
 * Pure helper: how many pixels above (negative) or below (positive) the
 * geometric midpoint a label should sit, given its position among its
 * source's outgoing edges.
 *
 * Extracted so it can be unit-tested directly — React Flow's edge paths
 * are not rendered in happy-dom (path math requires a real layout), so
 * we test the math here rather than via DOM scraping.
 */
export function computeStaggerOffsetY(siblingIndex: number, siblingCount: number): number {
  // Single sibling sits exactly on the midpoint (offset 0). Multiple
  // siblings are centred symmetrically around it: 4 edges → offsets
  // [-1.5, -0.5, 0.5, 1.5] × STAGGER_STEP = [-21, -7, 7, 21].
  const centre = (siblingCount - 1) / 2;
  return (siblingIndex - centre) * STAGGER_STEP;
}

/**
 * Pure guard: should we render any label DOM for this edge? React Flow's
 * built-in edge would render an empty floating box for `label = ''` or
 * `label = undefined`; we skip it entirely.
 */
export function shouldRenderLabel(label: unknown): label is string {
  return typeof label === 'string' && label.length > 0;
}

/**
 * Custom React Flow edge that fixes the "labels pile up at one Y" problem
 * we hit on wide branching flows.
 *
 * Behaviour:
 *   1. Path uses `getSmoothStepPath` (the same orthogonal shape Wati's own
 *      builder draws), so the wiring still looks like the rest of the
 *      product — only the label position is bespoke.
 *   2. Sibling edges from the same source are spread vertically around the
 *      geometric midpoint: with N siblings, the centre slot stays at the
 *      midpoint and outer slots step away by ±STAGGER_STEP per index.
 *      This is what prevents the "Subscription change | fallback | fallback
 *      | Feature question" stack we saw in user-reported screenshots.
 *   3. Fallback edges render dashed + with a softer label palette so a
 *      designer can spot "primary branch vs. catch-all" at a glance.
 *   4. Empty / undefined labels skip the label DOM entirely — needed
 *      because React Flow still renders an `<EdgeLabelRenderer>` child
 *      otherwise, which creates an empty floating box in the canvas.
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
  label,
  markerEnd,
}: EdgeProps) {
  const [edgePath, labelX, labelY] = getSmoothStepPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  const d = (data ?? {}) as Partial<StaggeredEdgeData>;
  const siblingIndex = d.siblingIndex ?? 0;
  const siblingCount = d.siblingCount ?? 1;
  const color = d.color ?? '#94a3b8';
  const isFallback = d.fallback === true;

  // Centre the stagger band on the midpoint: e.g. siblingCount=4 produces
  // offsets [-1.5, -0.5, 0.5, 1.5] × STAGGER_STEP → labels span ±21 px.
  const labelOffsetY = computeStaggerOffsetY(siblingIndex, siblingCount);

  // String labels are the only case for this graph; anything else is
  // ignored. Keeping the type guard explicit makes future regressions
  // (e.g. passing a JSX element) fail loudly rather than silently render.
  const showLabel = shouldRenderLabel(label);

  return (
    <>
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
      {showLabel ? (
        <EdgeLabelRenderer>
          <div
            className={`rf-edge-label${isFallback ? ' rf-edge-label-fallback' : ''}`}
            data-testid={`edge-label-${id}`}
            style={{
              position: 'absolute',
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY + labelOffsetY}px)`,
              pointerEvents: 'all',
              background: '#ffffff',
              border: `1px solid ${color}`,
              borderRadius: 4,
              padding: '2px 6px',
              fontSize: 11,
              fontWeight: 600,
              color,
              whiteSpace: 'nowrap',
              boxShadow: '0 1px 2px rgba(15, 23, 42, 0.08)',
              ...(isFallback ? { opacity: 0.9, fontWeight: 500 } : {}),
            }}
          >
            {label}
          </div>
        </EdgeLabelRenderer>
      ) : null}
    </>
  );
}

/**
 * Edge-type registry handed to `<ReactFlow>`. Exported here so the
 * component and its consumer (`FlowGraph.tsx`) reference the same object
 * — React Flow recreates internal maps on identity change, so a stable
 * module-level constant is the right pattern.
 */
export const FLOW_EDGE_TYPES = { staggered: StaggeredEdge };
