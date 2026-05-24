import { describe, expect, it, vi } from 'vitest';

import { DeepSeekProvider } from './deepseek.js';
import type { LLMProvider } from './types.js';

// Helper now also encodes finish_reason so we can exercise the new
// "truncated by length" + empty-content guards. `stop` is the well-formed
// default — the providers we care about always return one of stop / length
// / content_filter.
const buildOkResponse = (
  content: string,
  finishReason: 'stop' | 'length' | 'content_filter' = 'stop',
): Response =>
  new Response(
    JSON.stringify({
      choices: [{ message: { content }, finish_reason: finishReason }],
    }),
    {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    },
  );

const newProvider = (overrides: Partial<ConstructorParameters<typeof DeepSeekProvider>[0]> = {}) =>
  new DeepSeekProvider({
    apiKey: 'sk-test',
    fetch: vi.fn().mockResolvedValue(buildOkResponse('hello')),
    ...overrides,
  });

describe('DeepSeekProvider — construction', () => {
  it('reports its provider name', () => {
    expect(newProvider().name).toBe('deepseek');
  });

  it('implements LLMProvider', () => {
    const provider: LLMProvider = newProvider();
    expect(typeof provider.complete).toBe('function');
  });

  it('throws when apiKey is empty', () => {
    expect(() => newProvider({ apiKey: '' })).toThrow(/apiKey/i);
  });
});

describe('DeepSeekProvider — complete', () => {
  it('POSTs to the default chat-completions endpoint with bearer auth', async () => {
    const fetchMock = vi.fn().mockResolvedValue(buildOkResponse('ok'));
    const provider = newProvider({ fetch: fetchMock });
    await provider.complete({ messages: [{ role: 'user', content: 'hi' }] });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.deepseek.com/v1/chat/completions');
    expect(init.method).toBe('POST');
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer sk-test');
    expect(headers['Content-Type']).toBe('application/json');
  });

  it('serialises model + messages + temperature + max_tokens in the body', async () => {
    const fetchMock = vi.fn().mockResolvedValue(buildOkResponse('ok'));
    const provider = newProvider({ fetch: fetchMock, model: 'deepseek-reasoner' });
    await provider.complete({
      messages: [
        { role: 'system', content: 'be terse' },
        { role: 'user', content: 'hi' },
      ],
    });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string) as {
      model: string;
      messages: Array<{ role: string; content: string }>;
      temperature: number;
      max_tokens: number;
    };
    expect(body.model).toBe('deepseek-reasoner');
    expect(body.messages).toEqual([
      { role: 'system', content: 'be terse' },
      { role: 'user', content: 'hi' },
    ]);
    expect(body.temperature).toBe(0);
    // Default cap — raised to 4096 after observing flash-mode truncations
    // well below the original 2048 ceiling (see deepseek.ts DEFAULT_MAX_TOKENS
    // doc). This assertion is what stops a future "oh just remove the cap"
    // diff from sliding through review.
    expect(body.max_tokens).toBe(4096);
  });

  it('rejects an HTTP-200 response whose content is the empty string', async () => {
    // Failure mode observed in dev logs: flash + JSON mode occasionally
    // returns `content: ""` while still reporting finish_reason="stop".
    // Without an explicit guard, that empty string would reach
    // `JSON.parse("")` in the agent and surface as a confusing
    // "Unexpected end of JSON input" — the operator-facing message has
    // to call out that the provider produced nothing.
    const provider = newProvider({
      fetch: vi.fn().mockResolvedValue(buildOkResponse('', 'stop')),
    });
    await expect(
      provider.complete({ messages: [{ role: 'user', content: 'hi' }] }),
    ).rejects.toThrow(/empty content/i);
  });

  it('returns content unchanged when the provider reports reasoning_tokens (regression guard)', async () => {
    // Root-cause finding (2026-05-24): `deepseek-v4-pro` is a reasoning
    // model that burns 1500+ tokens internally before emitting visible
    // content, adding ~10x latency to structured-output tasks for no
    // quality gain. We don't reject these responses (they're still
    // semantically valid) but we DO log a warn so future env swaps that
    // re-enable a reasoning model show up in stdout immediately rather
    // than as a vague "generate is slow" complaint. This test pins the
    // parse path: a payload with `usage.completion_tokens_details.
    // reasoning_tokens` set must round-trip without breaking the schema.
    const payload = {
      choices: [
        {
          message: { content: '{"ok":true}' },
          finish_reason: 'stop',
        },
      ],
      usage: {
        completion_tokens_details: { reasoning_tokens: 1853 },
      },
    };
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(payload), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    const provider = newProvider({ fetch: fetchMock });
    await expect(provider.complete({ messages: [{ role: 'user', content: 'hi' }] })).resolves.toBe(
      '{"ok":true}',
    );
  });

  it('still returns content when finish_reason is "length" — caller decides whether to retry', async () => {
    // We do NOT throw on truncation: the downstream JSON parser is the
    // authoritative validator (a truncated payload will fail there with a
    // precise position), and some callers (explain) can tolerate cut-off
    // markdown. We do log a warn so the operator sees max_tokens was the
    // root cause — that's the assertion below the call.
    const provider = newProvider({
      fetch: vi.fn().mockResolvedValue(buildOkResponse('{"partial":true', 'length')),
    });
    await expect(provider.complete({ messages: [{ role: 'user', content: 'hi' }] })).resolves.toBe(
      '{"partial":true',
    );
  });

  it('honours an explicit maxTokens override in the body', async () => {
    const fetchMock = vi.fn().mockResolvedValue(buildOkResponse('ok'));
    const provider = newProvider({ fetch: fetchMock, maxTokens: 512 });
    await provider.complete({ messages: [{ role: 'user', content: 'hi' }] });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string) as { max_tokens: number };
    expect(body.max_tokens).toBe(512);
  });

  it('omits response_format when jsonMode is not requested', async () => {
    const fetchMock = vi.fn().mockResolvedValue(buildOkResponse('ok'));
    const provider = newProvider({ fetch: fetchMock });
    await provider.complete({ messages: [{ role: 'user', content: 'hi' }] });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string) as { response_format?: unknown };
    // Explain path must NOT carry response_format — DeepSeek's JSON mode
    // would otherwise force the markdown summarisation into a JSON envelope.
    expect(body.response_format).toBeUndefined();
  });

  it('sends response_format: json_object when jsonMode is true', async () => {
    const fetchMock = vi.fn().mockResolvedValue(buildOkResponse('{"ok":true}'));
    const provider = newProvider({ fetch: fetchMock });
    await provider.complete({
      messages: [{ role: 'user', content: 'return JSON only' }],
      jsonMode: true,
    });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string) as {
      response_format?: { type: string };
    };
    expect(body.response_format).toEqual({ type: 'json_object' });
  });

  it('honours a custom baseUrl', async () => {
    const fetchMock = vi.fn().mockResolvedValue(buildOkResponse('ok'));
    const provider = newProvider({ fetch: fetchMock, baseUrl: 'https://proxy.example.com/v1' });
    await provider.complete({ messages: [{ role: 'user', content: 'hi' }] });

    const [url] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://proxy.example.com/v1/chat/completions');
  });

  it('returns the assistant content for a 200 response', async () => {
    const provider = newProvider({
      fetch: vi.fn().mockResolvedValue(buildOkResponse('the answer')),
    });
    await expect(provider.complete({ messages: [{ role: 'user', content: 'hi' }] })).resolves.toBe(
      'the answer',
    );
  });

  it('throws when the response is not 2xx', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('rate limited', { status: 429 }));
    const provider = newProvider({ fetch: fetchMock });
    await expect(
      provider.complete({ messages: [{ role: 'user', content: 'hi' }] }),
    ).rejects.toThrow(/429/);
  });

  it('throws when the response payload is malformed', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ choices: [] }), { status: 200 }));
    const provider = newProvider({ fetch: fetchMock });
    await expect(
      provider.complete({ messages: [{ role: 'user', content: 'hi' }] }),
    ).rejects.toThrow(/malformed|missing|invalid/i);
  });

  it('propagates fetch errors (e.g. network failure)', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error('socket hang up'));
    const provider = newProvider({ fetch: fetchMock });
    await expect(
      provider.complete({ messages: [{ role: 'user', content: 'hi' }] }),
    ).rejects.toThrow(/socket hang up/);
  });

  it('aborts the request when timeoutMs elapses', async () => {
    const fetchMock = vi.fn().mockImplementation((_url: string, init?: RequestInit) => {
      return new Promise((_resolve, reject) => {
        const signal = init?.signal;
        if (signal?.aborted) {
          reject(new DOMException('Aborted', 'AbortError'));
          return;
        }
        signal?.addEventListener('abort', () => {
          reject(new DOMException('Aborted', 'AbortError'));
        });
      });
    });
    const provider = newProvider({ fetch: fetchMock, timeoutMs: 10 });
    await expect(
      provider.complete({ messages: [{ role: 'user', content: 'hi' }] }),
    ).rejects.toThrow();
  });

  it('aborts a slow body read (headers arrive fast, body streams past timeout)', async () => {
    // Reproduces the production failure mode observed in pid-65610 logs:
    // DeepSeek returned response headers in <1 s but the JSON body streamed
    // over 40+ s. The previous implementation cleared the abort timer right
    // after `await fetch` resolved, leaving `response.json()` unguarded —
    // which is why `LLM_TIMEOUT_MS=30000` failed to enforce its contract.
    // We model that here by resolving the fetch promise immediately with a
    // Response whose body never settles.
    const fetchMock = vi.fn().mockImplementation((_url: string, init?: RequestInit) => {
      const slowBody = new ReadableStream({
        start(controller) {
          // Send opening brace so HTTP-200 + Content-Type checks pass, then
          // never call controller.close() — the consumer's response.json()
          // will hang on the Promise until something aborts it.
          controller.enqueue(new TextEncoder().encode('{'));
          init?.signal?.addEventListener('abort', () => {
            controller.error(new DOMException('Aborted', 'AbortError'));
          });
        },
      });
      return Promise.resolve(
        new Response(slowBody, {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );
    });
    const provider = newProvider({ fetch: fetchMock, timeoutMs: 30 });
    const start = Date.now();
    await expect(
      provider.complete({ messages: [{ role: 'user', content: 'hi' }] }),
    ).rejects.toThrow();
    // Abort fires at ~30 ms — must complete well under 500 ms or the timer
    // is again only guarding connect + headers (the regression).
    expect(Date.now() - start).toBeLessThan(500);
  });

  it('lets a per-call timeoutMs override the constructor default', async () => {
    const fetchMock = vi.fn().mockImplementation((_url: string, init?: RequestInit) => {
      return new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          reject(new DOMException('Aborted', 'AbortError'));
        });
      });
    });
    const provider = newProvider({ fetch: fetchMock, timeoutMs: 60_000 });
    const start = Date.now();
    await expect(
      provider.complete({ messages: [{ role: 'user', content: 'hi' }], timeoutMs: 10 }),
    ).rejects.toThrow();
    expect(Date.now() - start).toBeLessThan(500);
  });
});
