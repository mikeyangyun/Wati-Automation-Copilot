import { describe, expect, it } from 'vitest';

import { DeepSeekProvider } from './deepseek.js';
import { createLLMProvider } from './factory.js';
import { MockLLMProvider } from './mock.js';

describe('createLLMProvider', () => {
  it('returns a MockLLMProvider when provider is "mock"', () => {
    const provider = createLLMProvider({ provider: 'mock' });
    expect(provider).toBeInstanceOf(MockLLMProvider);
  });

  it('returns a DeepSeekProvider when provider is "deepseek" and apiKey is set', () => {
    const provider = createLLMProvider({ provider: 'deepseek', apiKey: 'sk-test' });
    expect(provider).toBeInstanceOf(DeepSeekProvider);
  });

  it('throws when the deepseek provider has no apiKey', () => {
    expect(() => createLLMProvider({ provider: 'deepseek' })).toThrow(/apiKey/i);
  });

  it('throws on an unknown provider name', () => {
    expect(() => createLLMProvider({ provider: 'cohere' })).toThrow(/unknown.*provider/i);
  });
});
