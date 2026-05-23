import { describe, expect, it } from 'vitest';

import { newEdgeId, newFlowId, newIssueId, newMessageId, newNodeId, newSessionId } from './ids';

describe('id helpers', () => {
  it.each([
    ['flow', newFlowId, 'flow_'],
    ['node', newNodeId, 'node_'],
    ['edge', newEdgeId, 'edge_'],
    ['session', newSessionId, 'sess_'],
    ['message', newMessageId, 'msg_'],
    ['issue', newIssueId, 'iss_'],
  ] as const)('%s ids carry the %s prefix', (_label, factory, prefix) => {
    const id = factory();
    expect(id.startsWith(prefix)).toBe(true);
    expect(id.length).toBeGreaterThan(prefix.length + 4);
  });

  it('produces unique ids across calls', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 1_000; i += 1) {
      seen.add(newFlowId());
    }
    expect(seen.size).toBe(1_000);
  });

  it('does not share ids across factories', () => {
    expect(newFlowId().startsWith('flow_')).toBe(true);
    expect(newNodeId().startsWith('node_')).toBe(true);
    expect(newFlowId()).not.toEqual(newNodeId());
  });
});
