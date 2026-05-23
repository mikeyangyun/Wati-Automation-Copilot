import { z } from 'zod';

import type { LLMCompleteOptions, LLMProvider } from './types.js';

export interface DeepSeekProviderOptions {
  apiKey: string;
  baseUrl?: string;
  model?: string;
  timeoutMs?: number;
  fetch?: typeof globalThis.fetch;
}

const DEFAULT_BASE_URL = 'https://api.deepseek.com/v1';
const DEFAULT_MODEL = 'deepseek-chat';
const DEFAULT_TIMEOUT_MS = 30_000;

const ChatCompletionResponseSchema = z.object({
  choices: z
    .array(
      z.object({
        message: z.object({
          content: z.string(),
        }),
      }),
    )
    .min(1),
});

export class DeepSeekProvider implements LLMProvider {
  public readonly name = 'deepseek';

  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly model: string;
  private readonly defaultTimeoutMs: number;
  private readonly fetchFn: typeof globalThis.fetch;

  constructor(opts: DeepSeekProviderOptions) {
    if (!opts.apiKey) {
      throw new Error('DeepSeekProvider requires a non-empty apiKey');
    }
    this.apiKey = opts.apiKey;
    this.baseUrl = opts.baseUrl ?? DEFAULT_BASE_URL;
    this.model = opts.model ?? DEFAULT_MODEL;
    this.defaultTimeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.fetchFn = opts.fetch ?? globalThis.fetch;
  }

  async complete(opts: LLMCompleteOptions): Promise<string> {
    const timeoutMs = opts.timeoutMs ?? this.defaultTimeoutMs;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    let response: Response;
    try {
      response = await this.fetchFn(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: this.model,
          messages: opts.messages,
          temperature: 0,
        }),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new Error(`DeepSeek HTTP ${response.status}: ${body.slice(0, 200)}`);
    }

    const payload: unknown = await response.json();
    const parsed = ChatCompletionResponseSchema.safeParse(payload);
    if (!parsed.success) {
      throw new Error('DeepSeek response payload was malformed or missing content');
    }

    const content = parsed.data.choices[0]?.message.content;
    if (typeof content !== 'string') {
      throw new Error('DeepSeek response payload was malformed or missing content');
    }
    return content;
  }
}
