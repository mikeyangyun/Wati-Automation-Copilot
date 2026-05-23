import type { NodeType } from 'shared';

export interface NodeTypeStyle {
  /** Single emoji rendered in the upper-left of the node card. */
  emoji: string;
  /** Hex border / accent color. Used as the left rail and as edge label hint. */
  accent: string;
  /** Soft background color for the card body. */
  surface: string;
  /** Lowercase chip label rendered beneath the node title. */
  chipLabel: string;
}

/**
 * Single source of truth for type → visual style. Importing this map (or
 * `getNodeTypeStyle`) is the only sanctioned way to reach for a node's color
 * scheme. Keeping it co-located with the graph helps future palette tweaks
 * stay one-edit changes.
 */
export const NODE_TYPE_STYLES: Record<NodeType, NodeTypeStyle> = {
  trigger: {
    emoji: '🚀',
    accent: '#22c55e',
    surface: '#e8f8ee',
    chipLabel: 'trigger',
  },
  send_message: {
    emoji: '💬',
    accent: '#6b7280',
    surface: '#f3f4f6',
    chipLabel: 'send message',
  },
  ask_question: {
    emoji: '❓',
    accent: '#3b82f6',
    surface: '#e0ecff',
    chipLabel: 'ask question',
  },
  condition: {
    emoji: '⚖️',
    accent: '#f59e0b',
    surface: '#fff4d6',
    chipLabel: 'condition',
  },
  assign_to_team: {
    emoji: '👥',
    accent: '#a855f7',
    surface: '#f3e0ff',
    chipLabel: 'assign to team',
  },
  api_call: {
    emoji: '🔌',
    accent: '#06b6d4',
    surface: '#d0f3f8',
    chipLabel: 'api call',
  },
  wait: {
    emoji: '⏱️',
    accent: '#94a3b8',
    surface: '#f1f5f9',
    chipLabel: 'wait',
  },
};

export function getNodeTypeStyle(type: NodeType): NodeTypeStyle {
  return NODE_TYPE_STYLES[type];
}

/** Hard truncation length for graph node labels — see AC-V7. */
export const NODE_LABEL_MAX_CHARS = 28;

export function truncateLabel(label: string, max: number = NODE_LABEL_MAX_CHARS): string {
  if (label.length <= max) return label;
  return `${label.slice(0, max - 1).trimEnd()}…`;
}
