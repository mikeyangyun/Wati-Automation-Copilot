import type { Flow, Issue } from 'shared';

/**
 * `MISSING_ENTRY` (error)
 *
 * Fires when `flow.entryNodeId` does not correspond to any node in
 * `flow.nodes`. The flow is unrunnable in this state.
 */
export function detectMissingEntry(flow: Flow): Issue[] {
  const exists = flow.nodes.some((node) => node.id === flow.entryNodeId);
  if (exists) return [];
  return [
    {
      severity: 'error',
      code: 'MISSING_ENTRY',
      message: `Entry node "${flow.entryNodeId}" is not present in the flow's nodes.`,
      nodeIds: [],
    },
  ];
}
