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
 * Default completion-token cap. Originally tuned to 2048 to halve worst-case
 * latency vs. the DeepSeek API default (~4096), but production observation
 * on `deepseek-v4-flash` showed clean mid-string truncations at ~500 tokens
 * of *character* output — well below the cap, suggesting DeepSeek's flash
 * tokenizer counts JSON whitespace and bracket scaffolding more heavily
 * than expected. Raising to 4096 removes the cap as a suspect; if a flow
 * really emits >4096 tokens we want to find out (probably means the prompt
 * is too open-ended), not silently truncate.
 */
const DEFAULT_MAX_TOKENS = 4096;

/**
 * Response shape we actually depend on. `finish_reason` is optional in the
 * spec but every provider we've seen returns it; we make it optional here
 * for forward compatibility and log it on the way out — without that field
 * the difference between "model decided to stop" and "max_tokens hit" is
 * invisible, which is exactly the failure mode that bit us on flash + JSON
 * mode (mid-string truncation, no log explanation).
 */
const ChatCompletionResponseSchema = z.object({
  choices: z
    .array(
      z.object({
        message: z.object({
          content: z.string(),
        }),
        finish_reason: z.string().optional(),
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
    // The timer MUST guard the entire call — including streaming body read —
    // not just connect + headers. Node's fetch resolves the moment response
    // headers arrive (typically <1 s for DeepSeek) but the JSON body itself
    // streams token-by-token over 20–40 s. If we cleared the timer right
    // after `await fetch` (the previous shape) the abort signal would no
    // longer cover `response.json()`, and a 30 s timeout would silently
    // become "unbounded". `clearTimeout` therefore lives in the outer
    // `finally` so it always fires last, regardless of success or failure.
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    // `performance.now()` is a monotonic, sub-millisecond clock immune to
    // wall-clock jumps; we measure the operator-perceived "Generate is slow"
    // latency from request build through final JSON parse.
    const startedAt = performance.now();

    try {
      const response = await this.fetchFn(`${this.baseUrl}/chat/completions`, {
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

      if (!response.ok) {
        const body = await response.text().catch(() => '');
        throw new Error(`DeepSeek HTTP ${response.status}: ${body.slice(0, 200)}`);
      }

      const payload: unknown = await response.json();
      const parsed = ChatCompletionResponseSchema.safeParse(payload);
      if (!parsed.success) {
        throw new Error('DeepSeek response payload was malformed or missing content');
      }

      const choice = parsed.data.choices[0]!;
      const content = choice.message.content;
      const finishReason = choice.finish_reason ?? 'unknown';

      // Treat zero-length content as a provider-side failure rather than
      // letting it propagate to the agent's JSON parser as a confusing
      // "empty input" error. Observed in flash + JSON mode: the API
      // returns HTTP 200 with `content: ""` — almost certainly a
      // misalignment between the system prompt and the JSON-mode
      // grammar constraint. Throwing here triggers the agent's retry,
      // which is what we want.
      if (content.length === 0) {
        throw new Error(
          `DeepSeek returned empty content (finish_reason=${finishReason}); request shape OK but model produced no output`,
        );
      }

      // `finish_reason: "length"` is the smoking gun for a max_tokens-
      // truncated payload — the JSON parser will fail next, but the
      // operator-facing diagnostic should call out token exhaustion
      // explicitly so the fix ("raise max_tokens or shorten prompt")
      // is one log line away, not three layers of bisection.
      if (finishReason === 'length') {
        logger.warn(
          {
            provider: this.name,
            model: this.model,
            contentChars: content.length,
            maxTokens: this.maxTokens,
            finishReason,
          },
          'llm output truncated by max_tokens (finish_reason=length) — JSON parse will fail',
        );
      }

      const elapsedMs = Math.round(performance.now() - startedAt);
      logger.info(
        {
          provider: this.name,
          model: this.model,
          elapsedMs,
          contentChars: content.length,
          finishReason,
          ok: true,
        },
        'llm provider call ok',
      );
      return content;
    } catch (err) {
      // Single outer catch covers every failure mode — connection refused,
      // 4xx/5xx from DeepSeek, malformed payload, AND the slow-body-read
      // abort that the previous nested try shape silently swallowed (the
      // 30 s timer fires during `response.json()`, not `await fetch`).
      // `controller.signal.aborted` is the authoritative "we killed it"
      // signal — we read it instead of pattern-matching the error name,
      // which Node spells inconsistently across versions (`AbortError` /
      // `DOMException` / `TypeError: terminated`).
      const elapsedMs = Math.round(performance.now() - startedAt);
      const aborted = controller.signal.aborted;
      logger.warn(
        {
          provider: this.name,
          model: this.model,
          elapsedMs,
          timeoutMs,
          aborted,
          ok: false,
        },
        aborted ? 'llm provider call aborted by timeout' : 'llm provider call failed',
      );
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }
}
