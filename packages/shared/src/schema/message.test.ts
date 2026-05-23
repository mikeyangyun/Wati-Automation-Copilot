import { describe, expect, it } from 'vitest';

import { MessageSchema } from './message';

describe('MessageSchema (discriminated union)', () => {
  it('parses a bot message that carries a nodeId', () => {
    const msg = MessageSchema.parse({
      role: 'bot',
      content: 'Hi!',
      nodeId: 'n1',
      timestamp: '2026-05-23T10:00:00Z',
    });
    expect(msg.role).toBe('bot');
    if (msg.role === 'bot') {
      expect(msg.nodeId).toBe('n1');
    }
  });

  it('parses a user message without a nodeId', () => {
    const msg = MessageSchema.parse({
      role: 'user',
      content: 'buyer',
      timestamp: '2026-05-23T10:00:05Z',
    });
    expect(msg.role).toBe('user');
  });

  it('rejects a bot message missing nodeId', () => {
    expect(() =>
      MessageSchema.parse({
        role: 'bot',
        content: 'Hi!',
        timestamp: '2026-05-23T10:00:00Z',
      }),
    ).toThrow();
  });

  it('rejects an unknown role', () => {
    expect(() =>
      MessageSchema.parse({
        role: 'system',
        content: 'x',
        timestamp: '2026-05-23T10:00:00Z',
      }),
    ).toThrow();
  });

  it('rejects a non-ISO timestamp', () => {
    expect(() =>
      MessageSchema.parse({
        role: 'user',
        content: 'x',
        timestamp: 'yesterday',
      }),
    ).toThrow();
  });
});
