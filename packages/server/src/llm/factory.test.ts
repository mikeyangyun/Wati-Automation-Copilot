import { describe, expect, it } from 'vitest';

import { createLLMProvider } from './factory.js';
import { MockLLMProvider } from './mock.js';

describe('createLLMProvider', () => {
  it('returns a MockLLMProvider when provider is "mock"', () => {
    const provider = createLLMProvider({ provider: 'mock' });
    expect(provider).toBeInstanceOf(MockLLMProvider);
  });

  it('throws on an unknown provider name', () => {
    expect(() => createLLMProvider({ provider: 'cohere' })).toThrow(/unknown.*provider/i);
  });

  it('throws on the deepseek provider until it is implemented', () => {
    // Replaced by a real assertion in T2 (DeepSeekProvider).
    expect(() => createLLMProvider({ provider: 'deepseek' })).toThrow();
  });
});
