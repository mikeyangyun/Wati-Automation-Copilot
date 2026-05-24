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
const NODE_SEP = 48;
const RANK_SEP = 96;

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

  const g = new dagre.graphlib.Graph({ multigraph: true });
  g.setGraph({ rankdir: RANK_DIR, nodesep: NODE_SEP, ranksep: RANK_SEP });
  g.setDefaultEdgeLabel(() => ({}));

  for (const node of flow.nodes) {
    g.setNode(node.id, { width: NODE_WIDTH, height: NODE_HEIGHT });
  }
  for (const edge of safeEdges) {
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

  const edges: LayoutEdge[] = safeEdges.map((edge) => ({
    id: edge.id,
    source: edge.from,
    target: edge.to,
    ...(edge.condition !== undefined ? { label: edge.condition } : {}),
  }));

  return { nodes, edges };
}
