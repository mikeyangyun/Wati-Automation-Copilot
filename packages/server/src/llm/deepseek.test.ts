import { describe, expect, it, vi } from 'vitest';

import { DeepSeekProvider } from './deepseek.js';
import type { LLMProvider } from './types.js';

const buildOkResponse = (content: string): Response =>
  new Response(JSON.stringify({ choices: [{ message: { content } }] }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });

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
    // Default cap — sized empirically against the FlowSchema (see deepseek.ts
    // DEFAULT_MAX_TOKENS); this assertion is what stops a future "oh just
    // remove the cap" diff from sliding through review.
    expect(body.max_tokens).toBe(2048);
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
