import * as dagre from '@dagrejs/dagre';
import type { Edge as FlowEdge, Flow, Node as FlowNode, NodeType } from 'shared';

/**
 * Node + edge dimensions handed to dagre. Kept constant so positions are
 * stable across renders and across user-provided labels of varying length.
 * Visual truncation / per-type body height is the styling layer's job, not
 * the layout's — we pick a height generous enough for the tallest body
 * (ask_question with chips) so adjacent rows never overlap visually.
 */
export const NODE_WIDTH = 280;
export const NODE_HEIGHT = 160;
const RANK_DIR = 'TB' as const;
/**
 * Spacing knobs. Bumped from the original (48 / 96) after observing edge
 * crossings on wide branching flows (multiple ask_question subtrees in
 * parallel): tighter spacing forced dagre to route branches across each
 * other. Larger gaps give the barycenter pass enough room to keep each
 * subtree visually grouped.
 */
const NODE_SEP = 72;
/**
 * `ranksep` is now generous enough to absorb the vertical stagger that
 * `StaggeredEdge` adds to its edge labels — see `siblingIndex` /
 * `siblingCount` on the output below and the comment in `StaggeredEdge.tsx`.
 * With 4 siblings per source (e.g. a 3-choice ask_question + fallback)
 * staggered at ±21 px, total label band is ~42 px, comfortably inside 160.
 */
const RANK_SEP = 160;
/**
 * `tight-tree` produces cleaner branching layouts than the default
 * `network-simplex` for the shapes our `FlowAgent` emits — most generated
 * flows are short, wide trees with a fan-out at one or two ask_question
 * nodes, which is exactly tight-tree's strength.
 */
const RANKER = 'tight-tree' as const;

export interface LayoutNode {
  id: string;
  type: NodeType;
  label: string;
  config: FlowNode['config'];
  /** Top-left position for React Flow. Dagre emits center; we translate. */
  position: { x: number; y: number };
}

export interface LayoutEdge {
  id: string;
  source: string;
  target: string;
  /** `condition` from the source `Edge`, if any. */
  label?: string;
  /**
   * Position of this edge among its source's outgoing edges (0-based,
   * stable across runs). Consumed by `StaggeredEdge` to spread label
   * boxes vertically so siblings from the same source don't pile up.
   */
  siblingIndex: number;
  /** Total number of edges that share this edge's source. */
  siblingCount: number;
}

export interface LayoutResult {
  nodes: LayoutNode[];
  edges: LayoutEdge[];
}

/**
 * Deterministic top-down auto-layout for a `Flow`.
 *
 * - Pure function: same input -> same output (dagre is deterministic given
 *   the same node insertion order and config).
 * - Edges whose endpoints are missing from `flow.nodes` are dropped from the
 *   render. The structural validator already raises `DANGLING_EDGE` for those;
 *   we don't want the visual to crash on data the user is already being
 *   warned about.
 * - Returns top-left positions so React Flow can consume them directly.
 */
export function computeLayout(flow: Flow): LayoutResult {
  if (flow.nodes.length === 0) {
    return { nodes: [], edges: [] };
  }

  const nodeIds = new Set(flow.nodes.map((n) => n.id));
  const safeEdges: FlowEdge[] = flow.edges.filter((e) => nodeIds.has(e.from) && nodeIds.has(e.to));

  /**
   * Insertion order influences how dagre breaks ties when laying out a
   * rank. For each ask_question / condition, we want the children placed
   * left-to-right in a predictable, subtree-preserving order:
   *   1. group by source id (subtree locality stays intact);
   *   2. within a source, push fallback edges to the rightmost slot;
   *   3. within a source, otherwise sort alphabetically by condition
   *      label so identical flows give identical layouts.
   * This drastically reduces cross-subtree edge crossings on wide,
   * branching flows without forcing any visual hack at render time.
   */
  const sortedEdges: FlowEdge[] = [...safeEdges].sort((a, b) => {
    if (a.from !== b.from) return a.from.localeCompare(b.from);
    const aFallback = a.condition === 'fallback';
    const bFallback = b.condition === 'fallback';
    if (aFallback !== bFallback) return aFallback ? 1 : -1;
    return (a.condition ?? '').localeCompare(b.condition ?? '');
  });

  const g = new dagre.graphlib.Graph({ multigraph: true });
  g.setGraph({ rankdir: RANK_DIR, nodesep: NODE_SEP, ranksep: RANK_SEP, ranker: RANKER });
  g.setDefaultEdgeLabel(() => ({}));

  for (const node of flow.nodes) {
    g.setNode(node.id, { width: NODE_WIDTH, height: NODE_HEIGHT });
  }
  for (const edge of sortedEdges) {
    g.setEdge(edge.from, edge.to, {}, edge.id);
  }

  dagre.layout(g);

  const nodes: LayoutNode[] = flow.nodes.map((node) => {
    const placed = g.node(node.id);
    return {
      id: node.id,
      type: node.type,
      label: node.label,
      config: node.config,
      position: {
        x: placed.x - NODE_WIDTH / 2,
        y: placed.y - NODE_HEIGHT / 2,
      },
    };
  });

  // Pre-compute per-edge sibling stats off the sorted list (which is the
  // order users intuitively read: named branches first, fallback last).
  // Sibling index is what `StaggeredEdge` consumes to spread labels
  // vertically so labels from the same source never overlap.
  const siblingCountBySource = new Map<string, number>();
  for (const e of sortedEdges) {
    siblingCountBySource.set(e.from, (siblingCountBySource.get(e.from) ?? 0) + 1);
  }
  const seenBySource = new Map<string, number>();
  const slotByEdgeId = new Map<string, { siblingIndex: number; siblingCount: number }>();
  for (const e of sortedEdges) {
    const idx = seenBySource.get(e.from) ?? 0;
    seenBySource.set(e.from, idx + 1);
    slotByEdgeId.set(e.id, {
      siblingIndex: idx,
      siblingCount: siblingCountBySource.get(e.from) ?? 1,
    });
  }

  const edges: LayoutEdge[] = safeEdges.map((edge) => {
    const slot = slotByEdgeId.get(edge.id) ?? { siblingIndex: 0, siblingCount: 1 };
    return {
      id: edge.id,
      source: edge.from,
      target: edge.to,
      ...(edge.condition !== undefined ? { label: edge.condition } : {}),
      siblingIndex: slot.siblingIndex,
      siblingCount: slot.siblingCount,
    };
  });

  return { nodes, edges };
}
