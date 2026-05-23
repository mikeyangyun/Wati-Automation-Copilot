import { DeepSeekProvider } from './deepseek.js';
import { MockLLMProvider } from './mock.js';
import type { LLMProvider } from './types.js';

export interface LLMProviderConfig {
  provider: string;
  apiKey?: string;
  baseUrl?: string;
  model?: string;
  timeoutMs?: number;
}

export function createLLMProvider(config: LLMProviderConfig): LLMProvider {
  switch (config.provider) {
    case 'mock':
      return new MockLLMProvider();
    case 'deepseek': {
      if (!config.apiKey) {
        throw new Error('DeepSeek provider requires apiKey');
      }
      const opts: ConstructorParameters<typeof DeepSeekProvider>[0] = {
        apiKey: config.apiKey,
      };
      if (config.baseUrl !== undefined) opts.baseUrl = config.baseUrl;
      if (config.model !== undefined) opts.model = config.model;
      if (config.timeoutMs !== undefined) opts.timeoutMs = config.timeoutMs;
      return new DeepSeekProvider(opts);
    }
    default:
      throw new Error(`Unknown LLM provider: ${config.provider}`);
  }
}
