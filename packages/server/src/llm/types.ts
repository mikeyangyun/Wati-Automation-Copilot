export type LLMMessageRole = 'system' | 'user' | 'assistant';

export interface LLMMessage {
  role: LLMMessageRole;
  content: string;
}

export interface LLMCompleteOptions {
  messages: LLMMessage[];
  timeoutMs?: number;
  /**
   * Opt in to strict JSON output. When true, providers that support OpenAI-style
   * `response_format: { type: 'json_object' }` (DeepSeek v4, OpenAI gpt-4o, …)
   * will set it on the request, eliminating the malformed-JSON failure class
   * (unescaped quotes, trailing commas, prose before the brace).
   *
   * Callers MUST also mention "JSON" somewhere in `messages` — that's the
   * provider-side guard rail and not a typo: prompt-engineering and decoding
   * constraints have to agree, or DeepSeek rejects the request.
   *
   * Leave undefined / false for any path that wants prose (markdown explain).
   */
  jsonMode?: boolean;
}

export interface LLMProvider {
  readonly name: string;
  complete(opts: LLMCompleteOptions): Promise<string>;
}
