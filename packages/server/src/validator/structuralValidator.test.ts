import type { Flow } from 'shared';
import { describe, expect, it } from 'vitest';

import { detectDanglingEdges } from './rules/danglingEdge.js';
import { detectDuplicateConditions } from './rules/duplicateCondition.js';
import { detectMissingEntry } from './rules/missingEntry.js';
import { detectMissingFallback } from './rules/missingFallback.js';
import { detectUnreachableNodes } from './rules/unreachableNode.js';
import { validateFlow } from './structuralValidator.js';

/**
 * Canonical "complete" buyer / seller flow that should pass every rule.
 * Used as the negative baseline: any false positive on this fixture is a bug.
 */
function completeFlow(): Flow {
  return {
    id: 'flow_ok',
    name: 'Buyer / Seller',
    prompt: 'route buyers and sellers',
    trigger: { type: 'new_message' },
    entryNodeId: 'n_start',
    nodes: [
      { id: 'n_start', type: 'trigger', label: 'Start', config: {} },
      { id: 'n_greet', type: 'send_message', label: 'Greet', config: { text: 'Hi there!' } },
      {
        id: 'n_ask',
        type: 'ask_question',
        label: 'Ask buyer/seller',
        config: { text: 'Are you a buyer or a seller?' },
      },
      {
        id: 'n_sales',
        type: 'assign_to_team',
        label: 'Hand off to Sales',
        config: { team: 'Sales' },
      },
      {
        id: 'n_support',
        type: 'send_message',
        label: 'Send support article',
        config: { text: 'Here is our seller guide.' },
      },
      {
        id: 'n_fallback',
        type: 'assign_to_team',
        label: 'Fallback to human',
        config: { team: 'Support' },
      },
    ],
    edges: [
      { id: 'e0', from: 'n_start', to: 'n_greet' },
      { id: 'e1', from: 'n_greet', to: 'n_ask' },
      { id: 'e_buy', from: 'n_ask', to: 'n_sales', condition: 'buyer' },
      { id: 'e_sell', from: 'n_ask', to: 'n_support', condition: 'seller' },
      { id: 'e_default', from: 'n_ask', to: 'n_fallback' },
    ],
    createdAt: '2026-05-23T10:00:00Z',
  };
}

describe('validateFlow — happy path', () => {
  it('returns no issues for a complete flow', () => {
    expect(validateFlow(completeFlow())).toEqual([]);
  });

  it('returns 0 error-severity issues on the complete fixture', () => {
    const errors = validateFlow(completeFlow()).filter((issue) => issue.severity === 'error');
    expect(errors).toEqual([]);
  });
});

describe('detectMissingEntry', () => {
  it('fires when entryNodeId points to a non-existent node', () => {
    const flow = completeFlow();
    flow.entryNodeId = 'n_does_not_exist';
    const issues = detectMissingEntry(flow);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({
      severity: 'error',
      code: 'MISSING_ENTRY',
    });
    expect(issues[0]!.message).toContain('n_does_not_exist');
  });

  it('does not fire when entryNodeId resolves to a real node', () => {
    expect(detectMissingEntry(completeFlow())).toEqual([]);
  });
});

describe('detectDanglingEdges', () => {
  it('flags an edge whose target is missing', () => {
    const flow = completeFlow();
    flow.edges.push({ id: 'e_bad', from: 'n_ask', to: 'n_phantom' });
    const issues = detectDanglingEdges(flow);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({
      severity: 'error',
      code: 'DANGLING_EDGE',
      nodeIds: ['n_ask'],
    });
    expect(issues[0]!.message).toContain('n_phantom');
  });

  it('flags an edge whose source is missing', () => {
    const flow = completeFlow();
    flow.edges.push({ id: 'e_bad', from: 'n_phantom', to: 'n_sales' });
    const issues = detectDanglingEdges(flow);
    expect(issues).toHaveLength(1);
    expect(issues[0]!.nodeIds).toEqual(['n_sales']);
    expect(issues[0]!.message).toContain('n_phantom');
  });

  it('flags an edge whose both endpoints are missing with empty nodeIds', () => {
    const flow = completeFlow();
    flow.edges.push({ id: 'e_bad', from: 'n_ghost1', to: 'n_ghost2' });
    const issues = detectDanglingEdges(flow);
    expect(issues[0]!.nodeIds).toEqual([]);
  });

  it('does not fire for a healthy flow', () => {
    expect(detectDanglingEdges(completeFlow())).toEqual([]);
  });
});

describe('detectUnreachableNodes', () => {
  it('flags a node not reachable from entry', () => {
    const flow = completeFlow();
    flow.nodes.push({
      id: 'n_orphan',
      type: 'send_message',
      label: 'Orphaned message',
      config: { text: 'no one will see this' },
    });
    const issues = detectUnreachableNodes(flow);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({
      severity: 'warning',
      code: 'UNREACHABLE_NODE',
      nodeIds: ['n_orphan'],
    });
  });

  it('skips traversal when the entry itself is missing (defers to MISSING_ENTRY)', () => {
    const flow = completeFlow();
    flow.entryNodeId = 'n_ghost';
    expect(detectUnreachableNodes(flow)).toEqual([]);
  });

  it('ignores edges with dangling endpoints during traversal', () => {
    const flow = completeFlow();
    flow.edges.push({ id: 'e_bad', from: 'n_ghost', to: 'n_orphan' });
    flow.nodes.push({
      id: 'n_orphan',
      type: 'send_message',
      label: 'Orphan',
      config: { text: 'unreachable' },
    });
    const issues = detectUnreachableNodes(flow);
    expect(issues.map((i) => i.nodeIds[0])).toEqual(['n_orphan']);
  });

  it('does not fire for a healthy flow', () => {
    expect(detectUnreachableNodes(completeFlow())).toEqual([]);
  });
});

describe('detectMissingFallback', () => {
  it('flags an ask_question with labeled edges but no default edge', () => {
    const flow = completeFlow();
    flow.edges = flow.edges.filter((e) => e.id !== 'e_default');
    const issues = detectMissingFallback(flow);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({
      severity: 'warning',
      code: 'MISSING_FALLBACK',
      nodeIds: ['n_ask'],
    });
  });

  it('flags a condition node lacking a default edge', () => {
    const flow: Flow = {
      ...completeFlow(),
      entryNodeId: 'n_cond',
      nodes: [
        { id: 'n_cond', type: 'condition', label: 'High value?', config: {} },
        { id: 'n_a', type: 'send_message', label: 'A', config: { text: 'a' } },
        { id: 'n_b', type: 'send_message', label: 'B', config: { text: 'b' } },
      ],
      edges: [
        { id: 'e1', from: 'n_cond', to: 'n_a', condition: 'high' },
        { id: 'e2', from: 'n_cond', to: 'n_b', condition: 'low' },
      ],
    };
    const issues = detectMissingFallback(flow);
    expect(issues).toHaveLength(1);
    expect(issues[0]!.code).toBe('MISSING_FALLBACK');
  });

  it('does not fire when a default edge is present', () => {
    expect(detectMissingFallback(completeFlow())).toEqual([]);
  });

  it('does not fire for send_message nodes (no branching expected)', () => {
    const flow: Flow = {
      ...completeFlow(),
      entryNodeId: 'n_msg',
      nodes: [
        { id: 'n_msg', type: 'send_message', label: 'M', config: { text: 'hi' } },
        { id: 'n_end', type: 'assign_to_team', label: 'E', config: { team: 'Support' } },
      ],
      edges: [{ id: 'e1', from: 'n_msg', to: 'n_end', condition: 'always' }],
    };
    expect(detectMissingFallback(flow)).toEqual([]);
  });
});

describe('detectDuplicateConditions', () => {
  it('flags two outgoing edges with the same condition from the same source', () => {
    const flow = completeFlow();
    flow.edges.push({ id: 'e_dup', from: 'n_ask', to: 'n_sales', condition: 'buyer' });
    const issues = detectDuplicateConditions(flow);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({
      severity: 'warning',
      code: 'DUPLICATE_CONDITION',
      nodeIds: ['n_ask'],
    });
    expect(issues[0]!.message).toContain('buyer');
  });

  it('treats conditions case-insensitively and trims whitespace', () => {
    const flow = completeFlow();
    flow.edges.push({ id: 'e_dup', from: 'n_ask', to: 'n_sales', condition: '  BUYER  ' });
    const issues = detectDuplicateConditions(flow);
    expect(issues).toHaveLength(1);
  });

  it('ignores edges without a condition (the default edge)', () => {
    expect(detectDuplicateConditions(completeFlow())).toEqual([]);
  });

  it('does not fire when the same condition appears from different sources', () => {
    const flow = completeFlow();
    flow.nodes.push({
      id: 'n_ask2',
      type: 'ask_question',
      label: 'Ask again',
      config: { text: 'Confirm?' },
    });
    flow.edges.push({ id: 'e_dup', from: 'n_ask2', to: 'n_sales', condition: 'buyer' });
    expect(detectDuplicateConditions(flow)).toEqual([]);
  });
});

describe('validateFlow — aggregator integration', () => {
  it('preserves rule order: entry → dangling → unreachable → fallback → duplicates', () => {
    const flow = completeFlow();
    flow.entryNodeId = 'n_ghost';
    flow.edges.push({ id: 'e_bad', from: 'n_ask', to: 'n_phantom', condition: 'maybe' });
    flow.edges.push({ id: 'e_dup', from: 'n_ask', to: 'n_sales', condition: 'buyer' });
    flow.edges = flow.edges.filter((e) => e.id !== 'e_default');

    const issues = validateFlow(flow);
    const codes = issues.map((i) => i.code);
    expect(codes[0]).toBe('MISSING_ENTRY');
    expect(codes).toContain('DANGLING_EDGE');
    expect(codes).toContain('MISSING_FALLBACK');
    expect(codes).toContain('DUPLICATE_CONDITION');
  });
});
