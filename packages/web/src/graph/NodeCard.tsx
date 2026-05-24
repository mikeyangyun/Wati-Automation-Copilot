import { Handle, Position, type NodeProps } from '@xyflow/react';
import type { HttpMethod, Node as FlowNode, NodeType, Severity } from 'shared';

import { formatWaitDuration, getNodeTypeStyle, truncateLabel } from './nodeStyle.js';

/**
 * Data shape carried on each React Flow node. Keeping it lean — only what
 * the renderer needs. Layout positions live on the node itself (`x` / `y`),
 * not in `data`. The `config` is the discriminated-union config for the
 * matching node type; the body renderer narrows on `type`.
 */
export interface NodeCardData extends Record<string, unknown> {
  type: NodeType;
  label: string;
  /** Per-type node config, passed straight through from the Flow schema. */
  config?: FlowNode['config'];
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

/** Maximum option chips rendered inline before we collapse into "+N more". */
const ASK_QUESTION_CHIP_LIMIT = 4;

/**
 * Unified React Flow custom node, rebuilt to mirror Wati's real builder UX:
 * a colored header bar with the node's type display name, and a body that
 * reads from `config` to show what the node actually does (message preview,
 * option chips, team name, API endpoint, …). One component handles all
 * seven Wati node types — the type-driven branching lives in `NodeBody`.
 */
export function NodeCard({ data }: NodeProps) {
  const cardData = data as NodeCardData;
  const style = getNodeTypeStyle(cardData.type);
  const isSelected = cardData.selected === true;
  const glow = isSelected
    ? `0 0 0 3px ${SEVERITY_GLOW[cardData.selectedSeverity ?? 'info']}`
    : undefined;
  const isTruncatedLabel = cardData.label.length > 28;

  return (
    <div
      className="node-card"
      data-node-type={cardData.type}
      data-selected={isSelected || undefined}
      style={{
        boxShadow: glow,
        opacity: cardData.dimmed ? 0.45 : 1,
      }}
    >
      <Handle type="target" position={Position.Top} className="node-handle" />

      <div className="node-header" style={{ background: style.headerBg, color: style.headerText }}>
        <span className="node-header-icon" aria-hidden="true">
          {style.emoji}
        </span>
        <span className="node-header-name">{style.displayName}</span>
      </div>

      <div className="node-body">
        <div className="node-label" title={isTruncatedLabel ? cardData.label : undefined}>
          {truncateLabel(cardData.label)}
        </div>
        <NodeBody type={cardData.type} config={cardData.config} accent={style.accent} />
      </div>

      <Handle type="source" position={Position.Bottom} className="node-handle" />
    </div>
  );
}

/**
 * Per-type body renderer. Reads from the (already-validated upstream) Flow
 * node config and turns it into the small content preview a designer wants
 * to see at a glance. Safe even when `config` is undefined (older fixtures /
 * test setups) — every branch defends against missing fields.
 */
function NodeBody({
  type,
  config,
  accent,
}: {
  type: NodeType;
  config: NodeCardData['config'];
  accent: string;
}) {
  switch (type) {
    case 'trigger':
      return (
        <span className="node-starting-step" style={{ background: `${accent}1f`, color: accent }}>
          Starting step
        </span>
      );

    case 'send_message': {
      const text = readString(config, 'text');
      if (text === undefined) return null;
      return <p className="node-message">{text}</p>;
    }

    case 'ask_question': {
      const text = readString(config, 'text');
      const replies = readStringArray(config, 'expectedReplies');
      const visible = replies?.slice(0, ASK_QUESTION_CHIP_LIMIT) ?? [];
      const overflow = (replies?.length ?? 0) - visible.length;
      return (
        <>
          {text !== undefined && <p className="node-message node-message-question">{text}</p>}
          {visible.length > 0 && (
            <ul className="node-option-chips" aria-label="Expected replies">
              {visible.map((option) => (
                <li key={option} className="node-option-chip">
                  <span className="node-option-chip-label">{option}</span>
                  <span
                    className="node-option-chip-dot"
                    aria-hidden="true"
                    style={{ background: accent }}
                  />
                </li>
              ))}
              {overflow > 0 && (
                <li className="node-option-chip node-option-chip-overflow">+{overflow} more</li>
              )}
            </ul>
          )}
        </>
      );
    }

    case 'condition':
      return <p className="node-message node-message-muted">Branch logic</p>;

    case 'assign_to_team': {
      const team = readString(config, 'team');
      if (team === undefined) return null;
      return (
        <p className="node-team">
          <span className="node-team-label">Team:</span>{' '}
          <strong className="node-team-name">{team}</strong>
        </p>
      );
    }

    case 'api_call': {
      const method = readString(config, 'method') as HttpMethod | undefined;
      const url = readString(config, 'url');
      if (method === undefined && url === undefined) return null;
      return (
        <div className="node-api">
          {method !== undefined && (
            <span className="node-api-method" style={{ background: `${accent}22`, color: accent }}>
              {method}
            </span>
          )}
          {url !== undefined && (
            <span className="node-api-url" title={url}>
              {url}
            </span>
          )}
        </div>
      );
    }

    case 'wait': {
      const durationMs = readNumber(config, 'durationMs');
      if (durationMs === undefined) return null;
      return (
        <p className="node-message node-message-muted">Wait {formatWaitDuration(durationMs)}</p>
      );
    }
  }
}

function readString(config: NodeCardData['config'], key: string): string | undefined {
  if (!config) return undefined;
  const value = (config as Record<string, unknown>)[key];
  return typeof value === 'string' ? value : undefined;
}

function readStringArray(config: NodeCardData['config'], key: string): string[] | undefined {
  if (!config) return undefined;
  const value = (config as Record<string, unknown>)[key];
  if (!Array.isArray(value)) return undefined;
  return value.filter((v): v is string => typeof v === 'string');
}

function readNumber(config: NodeCardData['config'], key: string): number | undefined {
  if (!config) return undefined;
  const value = (config as Record<string, unknown>)[key];
  return typeof value === 'number' ? value : undefined;
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
