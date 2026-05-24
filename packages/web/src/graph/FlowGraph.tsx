import {
  Background,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  type Edge as RfEdge,
  type Node as RfNode,
} from '@xyflow/react';
import { useEffect, useMemo, useRef } from 'react';
import type { Flow, Severity } from 'shared';

import { FLOW_NODE_TYPES, type NodeCardData } from './NodeCard.js';
import { computeLayout } from './layout.js';
import { getNodeTypeStyle } from './nodeStyle.js';

import '@xyflow/react/dist/style.css';

export interface FlowGraphProps {
  flow: Flow;
  /** Node ids to highlight (driven by issue selection). */
  selectedNodeIds?: string[];
  /** Severity of the selection — drives the glow color. */
  selectedSeverity?: Severity;
}

/**
 * Read-only React Flow rendering of a generated `Flow`.
 *
 * - Layout is computed by `computeLayout` (pure, deterministic).
 * - Highlight state is driven from props, never owned here. The parent (App)
 *   is the single source of truth for "which issue is selected".
 * - When `selectedNodeIds` changes we ask React Flow to `fitView` so the
 *   user's focus is centered on the affected nodes.
 * - Empty-flow defence: if there are no nodes we render a placeholder
 *   instead of an empty React Flow surface.
 */
export function FlowGraph(props: FlowGraphProps) {
  if (props.flow.nodes.length === 0) {
    return (
      <div className="flow-graph flow-graph-empty" data-testid="flow-graph-empty">
        This flow has no nodes.
      </div>
    );
  }
  return (
    <ReactFlowProvider>
      <FlowGraphInner {...props} />
    </ReactFlowProvider>
  );
}

function FlowGraphInner({ flow, selectedNodeIds, selectedSeverity }: FlowGraphProps) {
  const { fitView } = useReactFlow();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const selectedSet = useMemo(() => new Set(selectedNodeIds ?? []), [selectedNodeIds]);
  const hasSelection = selectedSet.size > 0;

  const { rfNodes, rfEdges } = useMemo(() => {
    const layout = computeLayout(flow);
    const nodes: RfNode<NodeCardData>[] = layout.nodes.map((n) => ({
      id: n.id,
      type: n.type,
      position: n.position,
      data: {
        type: n.type,
        label: n.label,
        config: n.config,
        selected: selectedSet.has(n.id),
        ...(selectedSeverity !== undefined ? { selectedSeverity } : {}),
        dimmed: hasSelection && !selectedSet.has(n.id),
      },
      draggable: false,
      selectable: false,
    }));
    const edges: RfEdge[] = layout.edges.map((e) => {
      const sourceNode = layout.nodes.find((n) => n.id === e.source);
      const stroke = sourceNode ? getNodeTypeStyle(sourceNode.type).accent : '#94a3b8';
      return {
        id: e.id,
        source: e.source,
        target: e.target,
        type: 'smoothstep',
        ...(e.label !== undefined ? { label: e.label } : {}),
        style: { stroke, strokeWidth: 1.5 },
        labelStyle: { fontSize: 11, fontWeight: 600, fill: stroke },
        labelBgStyle: { fill: '#ffffff', stroke, strokeWidth: 1 },
        labelBgPadding: [4, 4] as [number, number],
        labelBgBorderRadius: 4,
      };
    });
    return { rfNodes: nodes, rfEdges: edges };
  }, [flow, selectedSet, selectedSeverity, hasSelection]);

  // Recenter the viewport whenever the set of highlighted nodes changes.
  // Skipped when nothing is selected so the user doesn't get an unsolicited
  // pan on initial render.
  useEffect(() => {
    if (!hasSelection) return;
    const ids = Array.from(selectedSet);
    // `fitView` accepts a `nodes` filter to zoom only to specific ids.
    // Wrap in a microtask so the new nodes are committed first.
    const handle = window.setTimeout(() => {
      fitView({
        nodes: ids.map((id) => ({ id })),
        duration: 300,
        padding: 0.25,
      });
    }, 0);
    return () => window.clearTimeout(handle);
  }, [selectedSet, hasSelection, fitView]);

  // Re-fit whenever the container resizes. React Flow's `fitView` prop only
  // fires once on mount; without this, opening the Explain or Review block
  // above the graph shrinks the container and pushes the existing viewport
  // transform off-canvas, leaving an apparently blank graph area. Skipped
  // when an issue is selected so the explicit selection fit isn't fought.
  useEffect(() => {
    if (typeof ResizeObserver === 'undefined') return;
    const el = containerRef.current;
    if (!el) return;

    let initial = true;
    const observer = new ResizeObserver(() => {
      // Skip the very first callback — `ReactFlow fitView` already ran on mount.
      if (initial) {
        initial = false;
        return;
      }
      if (hasSelection) return;
      fitView({ padding: 0.2 });
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [fitView, hasSelection]);

  return (
    <div className="flow-graph" data-testid="flow-graph" ref={containerRef}>
      <ReactFlow
        nodes={rfNodes}
        edges={rfEdges}
        nodeTypes={FLOW_NODE_TYPES}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={false}
        panOnDrag
        zoomOnScroll={false}
        zoomOnPinch
        proOptions={{ hideAttribution: true }}
      >
        <Background gap={20} size={1} color="#e5e7eb" />
      </ReactFlow>
    </div>
  );
}
