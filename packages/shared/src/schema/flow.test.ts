import { describe, expect, it } from 'vitest';

import { FlowSchema } from './flow';

const minimalFlow = {
  id: 'flow_x',
  name: 'Echo',
  prompt: 'Send hello when a contact messages.',
  trigger: { type: 'new_message' },
  entryNodeId: 'n0',
  nodes: [{ id: 'n0', type: 'trigger', label: 'Start', config: {} }],
  edges: [],
  createdAt: '2026-05-23T07:50:00Z',
};

const buyerSellerFlow = {
  id: 'flow_buyer_seller',
  name: 'Buyer / seller routing',
  prompt: 'When a new contact messages us, ask if they are a buyer or a seller.',
  trigger: { type: 'new_message' },
  entryNodeId: 'n0',
  nodes: [
    { id: 'n0', type: 'trigger', label: 'New contact', config: {} },
    {
      id: 'n1',
      type: 'ask_question',
      label: 'Buyer or seller?',
      config: { text: 'Are you a buyer or a seller?' },
    },
    { id: 'n2', type: 'condition', label: 'Match reply', config: {} },
    {
      id: 'n3',
      type: 'assign_to_team',
      label: 'Route to Sales',
      config: { team: 'sales' },
    },
    {
      id: 'n4',
      type: 'send_message',
      label: 'Help article',
      config: { text: 'Here is our help article: https://example.com' },
    },
  ],
  edges: [
    { id: 'e0', from: 'n0', to: 'n1' },
    { id: 'e1', from: 'n1', to: 'n2' },
    { id: 'e2', from: 'n2', to: 'n3', condition: 'buyer' },
    { id: 'e3', from: 'n2', to: 'n4', condition: 'seller' },
  ],
  createdAt: '2026-05-23T07:50:00Z',
};

describe('FlowSchema — happy paths', () => {
  it('parses a single-trigger minimal flow', () => {
    const flow = FlowSchema.parse(minimalFlow);
    expect(flow.id).toBe('flow_x');
    expect(flow.nodes).toHaveLength(1);
  });

  it('parses the buyer/seller reference flow end-to-end', () => {
    const flow = FlowSchema.parse(buyerSellerFlow);
    expect(flow.nodes).toHaveLength(5);
    expect(flow.edges.filter((e) => e.condition === 'buyer')).toHaveLength(1);
  });
});

describe('FlowSchema — required-field violations', () => {
  it.each(['id', 'name', 'prompt', 'entryNodeId', 'createdAt'] as const)(
    'rejects a flow with an empty %s',
    (field) => {
      expect(() => FlowSchema.parse({ ...minimalFlow, [field]: '' })).toThrow();
    },
  );

  it('rejects a flow with no nodes', () => {
    expect(() => FlowSchema.parse({ ...minimalFlow, nodes: [] })).toThrow();
  });

  it('rejects a flow with an invalid trigger', () => {
    expect(() => FlowSchema.parse({ ...minimalFlow, trigger: { type: 'cron' } })).toThrow();
  });

  it('rejects a flow whose node fails its own schema', () => {
    expect(() =>
      FlowSchema.parse({
        ...minimalFlow,
        nodes: [{ id: 'n0', type: 'send_message', label: 'No text', config: {} }],
      }),
    ).toThrow();
  });

  it('rejects a non-ISO createdAt', () => {
    expect(() => FlowSchema.parse({ ...minimalFlow, createdAt: 'yesterday' })).toThrow();
  });
});
