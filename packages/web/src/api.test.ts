import type { Flow } from 'shared';
import { describe, expect, it } from 'vitest';

import { ApiClient, ApiError } from './api.js';

const buildFlow = (overrides: Partial<Flow> = {}): Flow => ({
  id: 'flow_1',
  name: 'Sample',
  prompt: 'p',
  trigger: { type: 'new_message' },
  entryNodeId: 'n0',
  nodes: [{ id: 'n0', type: 'trigger', label: 'Start', config: {} }],
  edges: [],
  createdAt: '2026-05-23T10:00:00Z',
  ...overrides,
});

function jsonFetch(status: number, body: unknown): typeof globalThis.fetch {
  return async () =>
    new Response(body === undefined ? '' : JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });
}

function rawFetch(status: number, raw: string): typeof globalThis.fetch {
  return async () =>
    new Response(raw, {
      status,
      headers: { 'Content-Type': 'text/plain' },
    });
}

describe('ApiClient.generateFlow', () => {
  it('POSTs JSON to /api/flows/generate and returns the parsed flow on 200', async () => {
    const flow = buildFlow();
    const calls: Array<{ url: string; init: RequestInit | undefined }> = [];
    const fetchFn: typeof globalThis.fetch = async (input, init) => {
      calls.push({ url: input as string, init });
      return new Response(JSON.stringify({ flow }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    };
    const client = new ApiClient({ fetch: fetchFn });

    const result = await client.generateFlow('hi');

    expect(result).toEqual(flow);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe('/api/flows/generate');
    expect(calls[0]!.init?.method).toBe('POST');
    expect(JSON.parse(calls[0]!.init!.body as string)).toEqual({ prompt: 'hi' });
    expect((calls[0]!.init!.headers as Record<string, string>)['Content-Type']).toBe(
      'application/json',
    );
  });

  it('forwards an AbortSignal to fetch', async () => {
    let observed: AbortSignal | undefined;
    const fetchFn: typeof globalThis.fetch = async (_input, init) => {
      observed = init?.signal ?? undefined;
      return new Response(JSON.stringify({ flow: buildFlow() }), { status: 200 });
    };
    const client = new ApiClient({ fetch: fetchFn });
    const controller = new AbortController();

    await client.generateFlow('hi', controller.signal);

    expect(observed).toBe(controller.signal);
  });

  it('throws ApiError(INVALID_INPUT, 400) when the server returns 400', async () => {
    const client = new ApiClient({
      fetch: jsonFetch(400, { error: { code: 'INVALID_INPUT', message: 'bad prompt' } }),
    });
    await expect(client.generateFlow('')).rejects.toMatchObject({
      code: 'INVALID_INPUT',
      status: 400,
      message: 'bad prompt',
    });
  });

  it('throws ApiError(LLM_OUTPUT_INVALID, 422) on 422', async () => {
    const client = new ApiClient({
      fetch: jsonFetch(422, { error: { code: 'LLM_OUTPUT_INVALID', message: 'schema failed' } }),
    });
    await expect(client.generateFlow('hi')).rejects.toMatchObject({
      code: 'LLM_OUTPUT_INVALID',
      status: 422,
    });
  });

  it('throws ApiError(LLM_UNAVAILABLE, 502) on 502', async () => {
    const client = new ApiClient({
      fetch: jsonFetch(502, { error: { code: 'LLM_UNAVAILABLE', message: 'timeout' } }),
    });
    await expect(client.generateFlow('hi')).rejects.toMatchObject({
      code: 'LLM_UNAVAILABLE',
      status: 502,
    });
  });

  it('throws ApiError(NETWORK_ERROR, 0) when fetch itself throws', async () => {
    const client = new ApiClient({
      fetch: async () => {
        throw new TypeError('Failed to fetch');
      },
    });
    await expect(client.generateFlow('hi')).rejects.toMatchObject({
      code: 'NETWORK_ERROR',
      status: 0,
    });
  });

  it('throws ApiError(INVALID_RESPONSE) when 200 body fails FlowSchema', async () => {
    const client = new ApiClient({
      fetch: jsonFetch(200, { flow: { id: 'x' /* missing all required fields */ } }),
    });
    await expect(client.generateFlow('hi')).rejects.toMatchObject({
      code: 'INVALID_RESPONSE',
    });
  });

  it('falls back to a generic code when the error body is unstructured', async () => {
    const client = new ApiClient({
      fetch: rawFetch(500, 'oops not json'),
    });
    await expect(client.generateFlow('hi')).rejects.toMatchObject({
      code: 'UNKNOWN',
      status: 500,
    });
  });
});

describe('ApiClient.getFlow', () => {
  it('GETs /api/flows/:id and returns the parsed flow on 200', async () => {
    const flow = buildFlow({ id: 'flow_abc' });
    const calls: string[] = [];
    const client = new ApiClient({
      fetch: async (input) => {
        calls.push(input as string);
        return new Response(JSON.stringify({ flow }), { status: 200 });
      },
    });

    const result = await client.getFlow('flow_abc');

    expect(result).toEqual(flow);
    expect(calls[0]).toBe('/api/flows/flow_abc');
  });

  it('encodes special characters in the id', async () => {
    const calls: string[] = [];
    const client = new ApiClient({
      fetch: async (input) => {
        calls.push(input as string);
        return new Response(JSON.stringify({ flow: buildFlow({ id: 'flow/with space' }) }), {
          status: 200,
        });
      },
    });
    await client.getFlow('flow/with space');
    expect(calls[0]).toBe('/api/flows/flow%2Fwith%20space');
  });

  it('throws ApiError(FLOW_NOT_FOUND, 404) on 404', async () => {
    const client = new ApiClient({
      fetch: jsonFetch(404, { error: { code: 'FLOW_NOT_FOUND', message: 'gone' } }),
    });
    await expect(client.getFlow('flow_x')).rejects.toMatchObject({
      code: 'FLOW_NOT_FOUND',
      status: 404,
    });
  });
});

describe('ApiError', () => {
  it('preserves name, message, code, and status', () => {
    const err = new ApiError('FOO', 'bar', 418);
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe('ApiError');
    expect(err.message).toBe('bar');
    expect(err.code).toBe('FOO');
    expect(err.status).toBe(418);
  });
});
