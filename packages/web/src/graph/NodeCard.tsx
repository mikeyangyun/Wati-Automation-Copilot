import { Handle, Position, type NodeProps } from '@xyflow/react';
import type { NodeType, Severity } from 'shared';

import { getNodeTypeStyle, truncateLabel, NODE_LABEL_MAX_CHARS } from './nodeStyle.js';

/**
 * Data shape carried on each React Flow node. Keeping it lean — only what
 * the renderer needs. Layout positions live on the node itself (`x` / `y`),
 * not in `data`.
 */
export interface NodeCardData extends Record<string, unknown> {
  type: NodeType;
  label: string;
  /** True when this node is highlighted (e.g. user clicked an issue card). */
  selected?: boolean;
  /** Severity color for the highlight glow when `selected === true`. */
  selectedSeverity?: Severity;
  /** Dimmed-state opacity multiplier when an unrelated node is selected. */
  dimmed?: boolean;
}

const SEVERITY_GLOW: Record<Severity, string> = {
  error: 'rgba(220, 38, 38, 0.55)',
  warning: 'rgba(217, 119, 6, 0.55)',
  info: 'rgba(59, 130, 246, 0.55)',
};

/**
 * Unified React Flow custom node. One component handles all 7 Wati node
 * types because the visual differences are entirely driven by the type →
 * style map (see `nodeStyle.ts`). Single component = single visual contract,
 * which keeps the demo cohesive and the test surface small.
 */
export function NodeCard({ data }: NodeProps) {
  const cardData = data as NodeCardData;
  const style = getNodeTypeStyle(cardData.type);
  const isTruncated = cardData.label.length > NODE_LABEL_MAX_CHARS;
  const isSelected = cardData.selected === true;
  const glow = isSelected
    ? `0 0 0 3px ${SEVERITY_GLOW[cardData.selectedSeverity ?? 'info']}`
    : undefined;

  return (
    <div
      className="node-card"
      data-node-type={cardData.type}
      data-selected={isSelected || undefined}
      style={{
        background: style.surface,
        borderLeft: `4px solid ${style.accent}`,
        boxShadow: glow,
        opacity: cardData.dimmed ? 0.45 : 1,
      }}
    >
      <Handle type="target" position={Position.Top} className="node-handle" />
      <div className="node-card-row">
        <span className="node-emoji" aria-hidden="true">
          {style.emoji}
        </span>
        <span className="node-label" title={isTruncated ? cardData.label : undefined}>
          {truncateLabel(cardData.label)}
        </span>
      </div>
      <div className="node-chip" style={{ color: style.accent }}>
        {style.chipLabel}
      </div>
      <Handle type="source" position={Position.Bottom} className="node-handle" />
    </div>
  );
}

/**
 * Custom node-type registration object passed to `<ReactFlow nodeTypes={...} />`.
 * All Wati node types map to the same component; React Flow allows multiple
 * type keys to share a component, which avoids per-type boilerplate.
 */
export const FLOW_NODE_TYPES: Record<NodeType, typeof NodeCard> = {
  trigger: NodeCard,
  send_message: NodeCard,
  ask_question: NodeCard,
  condition: NodeCard,
  assign_to_team: NodeCard,
  api_call: NodeCard,
  wait: NodeCard,
};
