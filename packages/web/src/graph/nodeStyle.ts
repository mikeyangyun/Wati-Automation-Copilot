import type { NodeType } from 'shared';

export interface NodeTypeStyle {
  /** Single emoji icon shown in the colored header bar. */
  emoji: string;
  /** Human-readable label rendered in the header (e.g. "Send a message"). */
  displayName: string;
  /** Background color of the header bar. */
  headerBg: string;
  /** Text color used on the header. */
  headerText: string;
  /**
   * Accent color reused for edge stroke and for selection hints. Visually
   * tied to `headerBg` but kept as its own field in case we ever want the
   * header darker than the edge line.
   */
  accent: string;
}

/**
 * Single source of truth for type → visual style. Importing this map (or
 * `getNodeTypeStyle`) is the only sanctioned way to reach for a node's color
 * scheme. The palette mirrors Wati's real builder so the demo nodes read like
 * the product they target — colored header bar per type with the type name in
 * white, body left to NodeCard to render from config.
 */
export const NODE_TYPE_STYLES: Record<NodeType, NodeTypeStyle> = {
  trigger: {
    emoji: '⚡',
    displayName: 'Trigger',
    headerBg: '#16a34a',
    headerText: '#ffffff',
    accent: '#16a34a',
  },
  send_message: {
    emoji: '💬',
    displayName: 'Send a message',
    headerBg: '#ef4444',
    headerText: '#ffffff',
    accent: '#ef4444',
  },
  ask_question: {
    emoji: '❓',
    displayName: 'Ask question',
    headerBg: '#f97316',
    headerText: '#ffffff',
    accent: '#f97316',
  },
  condition: {
    emoji: '⚖️',
    displayName: 'Set a condition',
    headerBg: '#ca8a04',
    headerText: '#ffffff',
    accent: '#ca8a04',
  },
  assign_to_team: {
    emoji: '👥',
    displayName: 'Assign to team',
    headerBg: '#a855f7',
    headerText: '#ffffff',
    accent: '#a855f7',
  },
  api_call: {
    emoji: '🔌',
    displayName: 'API call',
    headerBg: '#06b6d4',
    headerText: '#ffffff',
    accent: '#06b6d4',
  },
  wait: {
    emoji: '⏱️',
    displayName: 'Wait',
    headerBg: '#64748b',
    headerText: '#ffffff',
    accent: '#64748b',
  },
};

export function getNodeTypeStyle(type: NodeType): NodeTypeStyle {
  return NODE_TYPE_STYLES[type];
}

/** Hard truncation length for graph node labels. */
export const NODE_LABEL_MAX_CHARS = 28;

export function truncateLabel(label: string, max: number = NODE_LABEL_MAX_CHARS): string {
  if (label.length <= max) return label;
  return `${label.slice(0, max - 1).trimEnd()}…`;
}

/**
 * Renders a `wait` node's `durationMs` config as a short human-readable string.
 * Pulled into nodeStyle so other surfaces (review, explain) can stay aligned.
 */
export function formatWaitDuration(durationMs: number): string {
  if (durationMs < 1000) return `${durationMs} ms`;
  const seconds = durationMs / 1000;
  if (seconds < 60) {
    return seconds % 1 === 0 ? `${seconds} s` : `${seconds.toFixed(1)} s`;
  }
  const minutes = seconds / 60;
  if (minutes < 60) {
    return minutes % 1 === 0 ? `${minutes} min` : `${minutes.toFixed(1)} min`;
  }
  const hours = minutes / 60;
  return hours % 1 === 0 ? `${hours} h` : `${hours.toFixed(1)} h`;
}
