import { describe, expect, it } from 'vitest';

import { SimulationEventSchema } from './simulationEvent.js';

describe('SimulationEventSchema', () => {
  it('accepts a branch event with an optional condition', () => {
    expect(
      SimulationEventSchema.parse({ type: 'branch', from: 'n1', to: 'n2', condition: 'buyer' }),
    ).toEqual({ type: 'branch', from: 'n1', to: 'n2', condition: 'buyer' });
    expect(SimulationEventSchema.parse({ type: 'branch', from: 'n1', to: 'n2' })).toEqual({
      type: 'branch',
      from: 'n1',
      to: 'n2',
    });
  });

  it('accepts fallback, retry, mock-api-call and handoff variants', () => {
    SimulationEventSchema.parse({ type: 'fallback', nodeId: 'n1', reason: 'no match' });
    SimulationEventSchema.parse({ type: 'retry', nodeId: 'n1', count: 0 });
    SimulationEventSchema.parse({ type: 'mock-api-call', nodeId: 'n1' });
    SimulationEventSchema.parse({
      type: 'mock-api-call',
      nodeId: 'n1',
      url: 'https://example.com/x',
    });
    SimulationEventSchema.parse({ type: 'handoff', nodeId: 'n1', team: 'Sales' });
  });

  it('rejects unknown event types via discriminated union', () => {
    expect(() => SimulationEventSchema.parse({ type: 'nope', nodeId: 'n1' })).toThrow();
  });

  it('rejects negative retry count and bad url shape', () => {
    expect(() => SimulationEventSchema.parse({ type: 'retry', nodeId: 'n1', count: -1 })).toThrow();
    expect(() =>
      SimulationEventSchema.parse({ type: 'mock-api-call', nodeId: 'n1', url: 'not a url' }),
    ).toThrow();
  });

  it('rejects empty strings on required fields', () => {
    expect(() =>
      SimulationEventSchema.parse({ type: 'handoff', nodeId: 'n1', team: '' }),
    ).toThrow();
    expect(() =>
      SimulationEventSchema.parse({ type: 'fallback', nodeId: '', reason: 'x' }),
    ).toThrow();
  });
});
