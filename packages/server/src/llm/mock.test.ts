import { describe, expect, it } from 'vitest';

import { MockLLMProvider } from './mock.js';
import type { LLMProvider } from './types.js';

describe('MockLLMProvider', () => {
  it('reports its provider name', () => {
    const provider = new MockLLMProvider();
    expect(provider.name).toBe('mock');
  });

  it('implements LLMProvider', () => {
    const provider: LLMProvider = new MockLLMProvider();
    expect(typeof provider.complete).toBe('function');
  });

  it('returns queued responses in order', async () => {
    const provider = new MockLLMProvider(['first', 'second']);
    await expect(provider.complete({ messages: [{ role: 'user', content: 'a' }] })).resolves.toBe(
      'first',
    );
    await expect(provider.complete({ messages: [{ role: 'user', content: 'b' }] })).resolves.toBe(
      'second',
    );
  });

  it('throws when the response queue is exhausted', async () => {
    const provider = new MockLLMProvider(['only']);
    await provider.complete({ messages: [{ role: 'user', content: 'x' }] });
    await expect(provider.complete({ messages: [{ role: 'user', content: 'y' }] })).rejects.toThrow(
      /exhausted/,
    );
  });

  it('rejects when an Error is queued', async () => {
    const boom = new Error('upstream timeout');
    const provider = new MockLLMProvider([boom]);
    await expect(provider.complete({ messages: [{ role: 'user', content: 'x' }] })).rejects.toBe(
      boom,
    );
  });

  it('exposes the call count for assertion in higher-level tests', async () => {
    const provider = new MockLLMProvider(['a', 'b']);
    expect(provider.callCount).toBe(0);
    await provider.complete({ messages: [{ role: 'user', content: 'x' }] });
    expect(provider.callCount).toBe(1);
    await provider.complete({ messages: [{ role: 'user', content: 'y' }] });
    expect(provider.callCount).toBe(2);
  });
});
