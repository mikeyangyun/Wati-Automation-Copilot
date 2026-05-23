export type LLMMessageRole = 'system' | 'user' | 'assistant';

export interface LLMMessage {
  role: LLMMessageRole;
  content: string;
}

export interface LLMCompleteOptions {
  messages: LLMMessage[];
  timeoutMs?: number;
}

export interface LLMProvider {
  readonly name: string;
  complete(opts: LLMCompleteOptions): Promise<string>;
}
