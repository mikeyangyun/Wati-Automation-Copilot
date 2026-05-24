import type { Edge, Node } from 'shared';
import { describe, expect, it } from 'vitest';

import { formatHandoffMessage, stepNode } from './nodeHandlers.js';

const edge = (id: string, to: string, condition?: string): Edge => ({
  id,
  from: 'src',
  to,
  ...(condition !== undefined ? { condition } : {}),
});

const trigger: Node = { id: 'n0', type: 'trigger', label: 'Start', config: {} };
const send: Node = { id: 'n1', type: 'send_message', label: 'Hi', config: { text: 'Hello!' } };
const ask: Node = {
  id: 'n2',
  type: 'ask_question',
  label: 'Q',
  config: { text: 'Buyer or seller?' },
};
const cond: Node = { id: 'n3', type: 'condition', label: 'Fork', config: {} };
const assign: Node = {
  id: 'n4',
  type: 'assign_to_team',
  label: 'Sales',
  config: { team: 'Sales' },
};
const api: Node = {
  id: 'n5',
  type: 'api_call',
  label: 'Lead',
  config: { url: 'https://example.com/lead', method: 'POST' },
};
const wait: Node = { id: 'n6', type: 'wait', label: 'pause', config: { durationMs: 0 } };

describe('stepNode — trigger', () => {
  it('follows its first outgoing edge without emitting any message', () => {
    const result = stepNode(trigger, { outgoingEdges: [edge('e1', 'n1')] });
    expect(result).toEqual({
      botMessages: [],
      events: [],
      advance: { kind: 'follow', edgeId: 'e1' },
    });
  });

  it('terminates with completed status when there are no outgoing edges', () => {
    const result = stepNode(trigger, { outgoingEdges: [] });
    expect(result.advance).toEqual({ kind: 'terminal', status: 'completed' });
  });
});

describe('stepNode — send_message', () => {
  it('emits the configured text and auto-advances', () => {
    const result = stepNode(send, { outgoingEdges: [edge('e', 'n_next')] });
    expect(result.botMessages).toEqual(['Hello!']);
    expect(result.advance).toEqual({ kind: 'follow', edgeId: 'e' });
  });

  it('emits the text and terminates when the flow ends here', () => {
    const result = stepNode(send, { outgoingEdges: [] });
    expect(result.botMessages).toEqual(['Hello!']);
    expect(result.advance).toEqual({ kind: 'terminal', status: 'completed' });
  });
});

describe('stepNode — ask_question', () => {
  it('emits the question text and waits for user input', () => {
    const result = stepNode(ask, { outgoingEdges: [edge('e1', 'n3', 'buyer')] });
    expect(result.botMessages).toEqual(['Buyer or seller?']);
    expect(result.events).toEqual([]);
    expect(result.advance).toEqual({ kind: 'wait' });
  });
});

describe('stepNode — condition', () => {
  const branches: Edge[] = [
    edge('e_b', 'n_buyer', 'buyer'),
    edge('e_s', 'n_seller', 'seller'),
    edge('e_fb', 'n_clarify', 'fallback'),
  ];

  it('forks on the last user reply when an exact match exists', () => {
    const result = stepNode(cond, { outgoingEdges: branches, lastUserMessage: 'Buyer' });
    expect(result.advance).toEqual({ kind: 'follow', edgeId: 'e_b' });
    expect(result.events).toEqual([
      { type: 'branch', from: 'n3', to: 'n_buyer', condition: 'buyer' },
    ]);
  });

  it('takes the fallback edge and emits a fallback event on no exact match', () => {
    const result = stepNode(cond, { outgoingEdges: branches, lastUserMessage: '???' });
    expect(result.advance).toEqual({ kind: 'follow', edgeId: 'e_fb' });
    expect(result.events).toEqual([
      { type: 'fallback', nodeId: 'n3', reason: 'no matching branch for reply' },
    ]);
  });

  it('terminates with completed when no match and no fallback are possible', () => {
    const noFallback = [edge('e_b', 'n_buyer', 'buyer'), edge('e_s', 'n_seller', 'seller')];
    const result = stepNode(cond, { outgoingEdges: noFallback, lastUserMessage: '???' });
    expect(result.advance).toEqual({ kind: 'terminal', status: 'completed' });
    expect(result.events[0]?.type).toBe('fallback');
  });

  it('without a prior reply, takes an unconditional outgoing edge if present', () => {
    const result = stepNode(cond, { outgoingEdges: [edge('e', 'n_next')] });
    expect(result.advance).toEqual({ kind: 'follow', edgeId: 'e' });
  });

  it('without a prior reply and no unconditional edge, terminates with a fallback event', () => {
    const result = stepNode(cond, { outgoingEdges: branches });
    expect(result.advance).toEqual({ kind: 'terminal', status: 'completed' });
    expect(result.events[0]?.type).toBe('fallback');
  });
});

describe('stepNode — assign_to_team', () => {
  it('emits a handoff transcript line, a handoff event, and terminates handed_off', () => {
    const result = stepNode(assign, { outgoingEdges: [] });
    expect(result.botMessages).toEqual(['Transferring you to the Sales team…']);
    expect(result.events).toEqual([{ type: 'handoff', nodeId: 'n4', team: 'Sales' }]);
    expect(result.advance).toEqual({ kind: 'terminal', status: 'handed_off' });
  });

  it('keeps the raw team name on the handoff event even when the message is sanitised', () => {
    // The trace event is the source of truth for downstream analytics, so we
    // intentionally do NOT mutate `team` on the way out — only the customer-
    // facing transcript line is cleaned up.
    const noisyTeam: Node = { ...assign, config: { team: 'Sales Agent' } };
    const result = stepNode(noisyTeam, { outgoingEdges: [] });
    expect(result.botMessages).toEqual(['Transferring you to the Sales team…']);
    expect(result.events).toEqual([{ type: 'handoff', nodeId: 'n4', team: 'Sales Agent' }]);
  });
});

describe('formatHandoffMessage', () => {
  it('uses a plain team name verbatim with a trailing "team"', () => {
    expect(formatHandoffMessage('Sales')).toBe('Transferring you to the Sales team…');
    expect(formatHandoffMessage('Billing')).toBe('Transferring you to the Billing team…');
  });

  it('strips a redundant " Agent" / " Agents" suffix so the message never reads as "Sales Agent team"', () => {
    // This is the exact bug a real LLM run produced — the team name was
    // "Sales Agent", which made the customer-facing line ambiguous ("agent"
    // overloads with "AI agent"). Sanitising at the boundary keeps the
    // message safe regardless of what the model chose.
    expect(formatHandoffMessage('Sales Agent')).toBe('Transferring you to the Sales team…');
    expect(formatHandoffMessage('Billing Agents')).toBe('Transferring you to the Billing team…');
  });

  it('strips a redundant " Team" / " Teams" suffix so the message never reads as "Sales team team"', () => {
    expect(formatHandoffMessage('Sales Team')).toBe('Transferring you to the Sales team…');
    expect(formatHandoffMessage('Support Teams')).toBe('Transferring you to the Support…');
  });

  it('strips a redundant " Bot" / " Department" / " Dept." suffix', () => {
    expect(formatHandoffMessage('Sales Bot')).toBe('Transferring you to the Sales team…');
    expect(formatHandoffMessage('Sales Department')).toBe('Transferring you to the Sales team…');
    expect(formatHandoffMessage('Sales Dept.')).toBe('Transferring you to the Sales team…');
    expect(formatHandoffMessage('Sales Dept')).toBe('Transferring you to the Sales team…');
  });

  it('does NOT append "team" when the name already names a group ("Support", "Help Desk", "Customer Service")', () => {
    // "Help Desk team" reads worse than "Help Desk" — the noun-phrase
    // already identifies a queue, so we use it as-is.
    expect(formatHandoffMessage('Customer Support')).toBe(
      'Transferring you to the Customer Support…',
    );
    expect(formatHandoffMessage('Help Desk')).toBe('Transferring you to the Help Desk…');
    expect(formatHandoffMessage('Sales Squad')).toBe('Transferring you to the Sales Squad…');
    expect(formatHandoffMessage('Customer Service')).toBe(
      'Transferring you to the Customer Service…',
    );
  });

  it('is case-insensitive when matching suffixes / group keywords', () => {
    expect(formatHandoffMessage('sales AGENT')).toBe('Transferring you to the sales team…');
    expect(formatHandoffMessage('customer support')).toBe(
      'Transferring you to the customer support…',
    );
  });

  it('falls back to a generic "human teammate" line for empty / whitespace / suffix-only inputs', () => {
    // These are pathological inputs (the LLM going off-script or a hand-edited
    // flow with an empty config). The customer should never see "Transferring
    // you to the  team…" with a hole in the middle.
    expect(formatHandoffMessage('')).toBe('Transferring you to a human teammate…');
    expect(formatHandoffMessage('   ')).toBe('Transferring you to a human teammate…');
    expect(formatHandoffMessage('Team')).toBe('Transferring you to a human teammate…');
    expect(formatHandoffMessage('Agents')).toBe('Transferring you to a human teammate…');
  });

  it('preserves multi-word team names that do NOT carry a suffix', () => {
    expect(formatHandoffMessage('Customer Success')).toBe(
      'Transferring you to the Customer Success team…',
    );
    expect(formatHandoffMessage('Tier 2')).toBe('Transferring you to the Tier 2 team…');
  });
});

describe('stepNode — api_call', () => {
  it('emits a mock-api-call event with the configured url and auto-advances', () => {
    const result = stepNode(api, { outgoingEdges: [edge('e', 'n_next')] });
    expect(result.botMessages).toEqual([]);
    expect(result.events).toEqual([
      { type: 'mock-api-call', nodeId: 'n5', url: 'https://example.com/lead' },
    ]);
    expect(result.advance).toEqual({ kind: 'follow', edgeId: 'e' });
  });

  it('terminates completed when api_call has no outgoing edge', () => {
    const result = stepNode(api, { outgoingEdges: [] });
    expect(result.advance).toEqual({ kind: 'terminal', status: 'completed' });
  });
});

describe('stepNode — wait', () => {
  it('emits nothing and advances instantly (no real delay, no event)', () => {
    const result = stepNode(wait, { outgoingEdges: [edge('e', 'n_next')] });
    expect(result.botMessages).toEqual([]);
    expect(result.events).toEqual([]);
    expect(result.advance).toEqual({ kind: 'follow', edgeId: 'e' });
  });

  it('terminates completed when wait has no outgoing edge', () => {
    const result = stepNode(wait, { outgoingEdges: [] });
    expect(result.advance).toEqual({ kind: 'terminal', status: 'completed' });
  });
});
