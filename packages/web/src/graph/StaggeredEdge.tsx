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
 * Vertical pixel step between adjacent sibling label boxes. Sized to be
 * strictly larger than a rendered label's height so adjacent slots cannot
 * visually overlap:
 *   font-size 10.5 + line-height ~1.2 → ~13 px text
 *   + 2 × 2 px padding (top/bottom) + 2 × 1 px border = ~19 px total
 * 22 px leaves a ~3 px gap between rows — tight, but unambiguously
 * non-overlapping at any zoom level.
 *
 * The previous value (14 px) was smaller than label height, which is
 * exactly the visible "labels piled into a stripe" regression the user
 * caught on a high-fan-out flow.
 */
export const STAGGER_STEP = 22;

/**
 * Maximum half-band the stagger may occupy on either side of the geometric
 * midpoint. Kept below `RANK_SEP / 2 - card-margin` so labels never spill
 * across rank boundaries even when a source has many outgoing edges.
 */
export const MAX_HALF_BAND_PX = 56;

/**
 * Pure helper: how many pixels above (negative) or below (positive) the
 * geometric midpoint a label should sit, given its position among its
 * source's outgoing edges.
 *
 * Behaviour:
 *   - 1 sibling: offset 0 (sits on the midpoint).
 *   - 2–N siblings ≤ "natural" capacity: offsets are
 *     (siblingIndex − centre) × STAGGER_STEP, symmetric around the
 *     midpoint and guaranteed non-overlapping (step > label height).
 *   - Pathological fan-out (so many siblings that
 *     STAGGER_STEP × (count − 1) would exceed 2 × MAX_HALF_BAND_PX):
 *     the step is compressed so the whole band stays inside
 *     ±MAX_HALF_BAND_PX. In that degenerate case adjacent labels start
 *     to overlap — the underlying flow is over-branched and should be
 *     simplified — but at least we don't bleed into the neighbouring
 *     rank's cards. Reviewers see the issue, not a layout explosion.
 *
 * Extracted so it can be unit-tested directly — React Flow's edge paths
 * are not rendered in happy-dom (path math requires a real layout), so
 * we test the math here rather than via DOM scraping.
 */
export function computeStaggerOffsetY(siblingIndex: number, siblingCount: number): number {
  if (siblingCount <= 1) return 0;
  const centre = (siblingCount - 1) / 2;
  // Per-step room when distributing siblingCount labels into the band.
  const compressedStep = (MAX_HALF_BAND_PX * 2) / (siblingCount - 1);
  const step = Math.min(STAGGER_STEP, compressedStep);
  return (siblingIndex - centre) * step;
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
            // `title` is the accessible "full text on hover" fallback for the
            // CSS ellipsis truncation we apply to long branch labels.
            title={label}
            style={{
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY + labelOffsetY}px)`,
              borderColor: color,
              color,
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
