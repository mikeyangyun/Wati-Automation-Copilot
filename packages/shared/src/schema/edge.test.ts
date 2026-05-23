import { describe, expect, it } from 'vitest';

import { EdgeSchema } from './edge';

describe('EdgeSchema', () => {
  it('parses an unconditional edge', () => {
    const edge = EdgeSchema.parse({ id: 'edge_1', from: 'n0', to: 'n1' });
    expect(edge.condition).toBeUndefined();
  });

  it('parses an edge with a branch condition label', () => {
    const edge = EdgeSchema.parse({
      id: 'edge_2',
      from: 'n2',
      to: 'n3',
      condition: 'buyer',
    });
    expect(edge.condition).toBe('buyer');
  });

  it('rejects an empty id', () => {
    expect(() => EdgeSchema.parse({ id: '', from: 'n0', to: 'n1' })).toThrow();
  });

  it.each(['from', 'to'] as const)('rejects missing %s', (field) => {
    const payload: Record<string, string> = { id: 'edge_3', from: 'n0', to: 'n1' };
    delete payload[field];
    expect(() => EdgeSchema.parse(payload)).toThrow();
  });

  it('rejects same-node self-loops', () => {
    expect(() => EdgeSchema.parse({ id: 'edge_x', from: 'n1', to: 'n1' })).toThrow();
  });
});
