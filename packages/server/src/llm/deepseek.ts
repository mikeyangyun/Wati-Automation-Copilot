import { z } from 'zod';

import { logger } from '../logger.js';
import type { LLMCompleteOptions, LLMProvider } from './types.js';

export interface DeepSeekProviderOptions {
  apiKey: string;
  baseUrl?: string;
  model?: string;
  timeoutMs?: number;
  /**
   * Hard upper bound on completion tokens the model may emit per call.
   * Defaults to {@link DEFAULT_MAX_TOKENS}. The DeepSeek API's own default
   * is ~4096, which means a chatty model on a wide-branching flow can
   * legitimately take 20–30 s — that's the latency operators see when
   * `generate` "runs forever". Capping here turns worst-case into a known
   * quantity; 2048 still comfortably fits a 15-node flow JSON.
   */
  maxTokens?: number;
  fetch?: typeof globalThis.fetch;
}

const DEFAULT_BASE_URL = 'https://api.deepseek.com/v1';
const DEFAULT_MODEL = 'deepseek-chat';
const DEFAULT_TIMEOUT_MS = 30_000;
/**
 * Default completion-token cap. Sized empirically off the FlowSchema:
 * a 15-node flow with full `expectedReplies` + handoff messages clocks
 * around 1500 tokens of JSON; 2048 leaves ~30% headroom for verbose
 * model output while still cutting worst-case latency in half vs. the
 * DeepSeek API default (~4096).
 */
const DEFAULT_MAX_TOKENS = 2048;

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
  private readonly maxTokens: number;
  private readonly fetchFn: typeof globalThis.fetch;

  constructor(opts: DeepSeekProviderOptions) {
    if (!opts.apiKey) {
      throw new Error('DeepSeekProvider requires a non-empty apiKey');
    }
    this.apiKey = opts.apiKey;
    this.baseUrl = opts.baseUrl ?? DEFAULT_BASE_URL;
    this.model = opts.model ?? DEFAULT_MODEL;
    this.defaultTimeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.maxTokens = opts.maxTokens ?? DEFAULT_MAX_TOKENS;
    this.fetchFn = opts.fetch ?? globalThis.fetch;
  }

  async complete(opts: LLMCompleteOptions): Promise<string> {
    const timeoutMs = opts.timeoutMs ?? this.defaultTimeoutMs;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    // `performance.now()` gives us a monotonic, sub-millisecond clock that
    // — unlike `Date.now()` — is immune to wall-clock jumps mid-request.
    // We log the elapsed wall time around fetch + JSON parse because that
    // is the latency component the operator perceives as "Generate is slow".
    const startedAt = performance.now();

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
          // `max_tokens` is the single biggest worst-case-latency knob on
          // OpenAI-compatible chat APIs: without it, a model that "decides"
          // to be verbose can run right up to the API default (~4096) and
          // burn most of LLM_TIMEOUT_MS. See DEFAULT_MAX_TOKENS doc above
          // for sizing.
          max_tokens: this.maxTokens,
          // Opt-in JSON decoding mode. When the caller asks for jsonMode we
          // let DeepSeek's grammar-constrained decoder guarantee a parseable
          // JSON object — eliminates the failure class where the model
          // forgets to escape a quote on token #500 and the whole 30-second
          // generation is wasted. Caller is contracted to mention "JSON" in
          // the prompt; we don't double-validate here because every current
          // call site already does.
          ...(opts.jsonMode === true ? { response_format: { type: 'json_object' as const } } : {}),
        }),
        signal: controller.signal,
      });
    } catch (err) {
      const elapsedMs = Math.round(performance.now() - startedAt);
      logger.warn(
        { provider: this.name, model: this.model, elapsedMs, ok: false },
        'llm provider call failed',
      );
      throw err;
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

    const elapsedMs = Math.round(performance.now() - startedAt);
    logger.info(
      {
        provider: this.name,
        model: this.model,
        elapsedMs,
        contentChars: content.length,
        ok: true,
      },
      'llm provider call ok',
    );
    return content;
  }
}
