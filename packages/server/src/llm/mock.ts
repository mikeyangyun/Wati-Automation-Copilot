import type { LLMCompleteOptions, LLMProvider } from './types.js';

export type MockLLMResponse = string | Error;

export class MockLLMProvider implements LLMProvider {
  public readonly name = 'mock';

  private readonly responses: MockLLMResponse[];
  private cursor = 0;

  constructor(responses: MockLLMResponse[] = []) {
    this.responses = [...responses];
  }

  get callCount(): number {
    return this.cursor;
  }

  async complete(_opts: LLMCompleteOptions): Promise<string> {
    const next = this.responses[this.cursor];
    this.cursor += 1;

    if (next === undefined) {
      throw new Error(`MockLLMProvider response queue exhausted after ${this.cursor - 1} call(s)`);
    }

    if (next instanceof Error) {
      throw next;
    }

    return next;
  }
}
