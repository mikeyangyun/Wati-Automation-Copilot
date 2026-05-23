import { describe, expect, it } from 'vitest';

import { NodeSchema, NodeTypeEnum } from './node.js';

const base = { id: 'node_x', label: 'Label' };

describe('NodeTypeEnum', () => {
  it('lists the seven supported node types', () => {
    expect(NodeTypeEnum.options).toEqual([
      'trigger',
      'send_message',
      'ask_question',
      'condition',
      'assign_to_team',
      'api_call',
      'wait',
    ]);
  });
});

describe('NodeSchema — happy paths', () => {
  it.each([
    ['trigger', {}],
    ['send_message', { text: 'Hi!' }],
    ['ask_question', { text: 'Buyer or seller?' }],
    ['condition', {}],
    ['assign_to_team', { team: 'sales' }],
    ['api_call', { url: 'https://example.com', method: 'POST' }],
    ['wait', { durationMs: 1000 }],
  ] as const)('parses a valid %s node', (type, config) => {
    const node = NodeSchema.parse({ ...base, type, config });
    expect(node.type).toBe(type);
  });

  it('accepts ask_question with expectedReplies', () => {
    const node = NodeSchema.parse({
      ...base,
      type: 'ask_question',
      config: { text: 'q', expectedReplies: ['buyer', 'seller'] },
    });
    expect(node.type).toBe('ask_question');
    if (node.type === 'ask_question') {
      expect(node.config.expectedReplies).toEqual(['buyer', 'seller']);
    }
  });

  it('accepts a node with position', () => {
    const node = NodeSchema.parse({
      ...base,
      type: 'send_message',
      config: { text: 'x' },
      position: { x: 10, y: 20 },
    });
    expect(node.position).toEqual({ x: 10, y: 20 });
  });
});

describe('NodeSchema — config validation', () => {
  it('rejects send_message without text', () => {
    expect(() => NodeSchema.parse({ ...base, type: 'send_message', config: {} })).toThrow();
  });

  it('rejects ask_question without text', () => {
    expect(() => NodeSchema.parse({ ...base, type: 'ask_question', config: {} })).toThrow();
  });

  it('rejects assign_to_team without team', () => {
    expect(() => NodeSchema.parse({ ...base, type: 'assign_to_team', config: {} })).toThrow();
  });

  it('rejects api_call without url', () => {
    expect(() =>
      NodeSchema.parse({
        ...base,
        type: 'api_call',
        config: { method: 'GET' },
      }),
    ).toThrow();
  });

  it('rejects api_call with an invalid method', () => {
    expect(() =>
      NodeSchema.parse({
        ...base,
        type: 'api_call',
        config: { url: 'https://x.com', method: 'BREW' },
      }),
    ).toThrow();
  });

  it('rejects api_call with a non-URL string', () => {
    expect(() =>
      NodeSchema.parse({
        ...base,
        type: 'api_call',
        config: { url: 'not-a-url', method: 'GET' },
      }),
    ).toThrow();
  });

  it('rejects wait with a negative durationMs', () => {
    expect(() =>
      NodeSchema.parse({
        ...base,
        type: 'wait',
        config: { durationMs: -1 },
      }),
    ).toThrow();
  });

  it('rejects an unknown node type', () => {
    expect(() => NodeSchema.parse({ ...base, type: 'tap_dance', config: {} })).toThrow();
  });

  it('rejects empty id', () => {
    expect(() => NodeSchema.parse({ id: '', label: 'x', type: 'trigger', config: {} })).toThrow();
  });

  it('rejects empty label', () => {
    expect(() =>
      NodeSchema.parse({ id: 'node_x', label: '', type: 'trigger', config: {} }),
    ).toThrow();
  });
});
