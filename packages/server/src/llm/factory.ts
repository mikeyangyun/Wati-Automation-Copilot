import { MockLLMProvider } from './mock.js';
import type { LLMProvider } from './types.js';

export interface LLMProviderConfig {
  provider: string;
}

export function createLLMProvider(config: LLMProviderConfig): LLMProvider {
  switch (config.provider) {
    case 'mock':
      return new MockLLMProvider();
    case 'deepseek':
      throw new Error('DeepSeekProvider is not implemented yet (Phase 1 / T2)');
    default:
      throw new Error(`Unknown LLM provider: ${config.provider}`);
  }
}
