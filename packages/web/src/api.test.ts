import type { Flow, Issue, Session } from 'shared';
import { describe, expect, it } from 'vitest';

import { ApiClient, ApiError, type ReviewResult, type SessionEnvelope } from './api.js';

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

// ---------------------------------------------------------------------------
// Simulation endpoints — startSession / stepSession / resetSession
// ---------------------------------------------------------------------------

const buildSession = (overrides: Partial<Session> = {}): Session => ({
  id: 'sess_1',
  flowId: 'flow_1',
  currentNodeId: 'n1',
  status: 'waiting_for_input',
  transcript: [],
  context: { retryCount: 0 },
  ...overrides,
});

const buildEnvelope = (overrides: Partial<SessionEnvelope> = {}): SessionEnvelope => ({
  session: buildSession(),
  botMessages: ['Buyer or seller?'],
  events: [],
  ...overrides,
});

describe('ApiClient.startSession', () => {
  it('POSTs to /api/flows/:id/simulate/start and returns the parsed envelope', async () => {
    const envelope = buildEnvelope();
    const calls: Array<{ url: string; init: RequestInit | undefined }> = [];
    const client = new ApiClient({
      fetch: async (input, init) => {
        calls.push({ url: input as string, init });
        return new Response(JSON.stringify(envelope), { status: 200 });
      },
    });

    const result = await client.startSession('flow_1');

    expect(result).toEqual(envelope);
    expect(calls[0]!.url).toBe('/api/flows/flow_1/simulate/start');
    expect(calls[0]!.init?.method).toBe('POST');
    expect(calls[0]!.init?.body).toBeUndefined();
  });

  it('encodes special characters in flowId', async () => {
    const calls: string[] = [];
    const client = new ApiClient({
      fetch: async (input) => {
        calls.push(input as string);
        return new Response(JSON.stringify(buildEnvelope()), { status: 200 });
      },
    });
    await client.startSession('flow/with space');
    expect(calls[0]).toBe('/api/flows/flow%2Fwith%20space/simulate/start');
  });

  it('throws ApiError(FLOW_NOT_FOUND, 404) when the flow is missing', async () => {
    const client = new ApiClient({
      fetch: jsonFetch(404, { error: { code: 'FLOW_NOT_FOUND', message: 'gone' } }),
    });
    await expect(client.startSession('flow_x')).rejects.toMatchObject({
      code: 'FLOW_NOT_FOUND',
      status: 404,
    });
  });

  it('throws ApiError(INVALID_RESPONSE) when 200 body fails the envelope schema', async () => {
    const client = new ApiClient({
      fetch: jsonFetch(200, { session: { id: 'sess_x' } /* botMessages/events missing */ }),
    });
    await expect(client.startSession('flow_1')).rejects.toMatchObject({
      code: 'INVALID_RESPONSE',
    });
  });
});

describe('ApiClient.stepSession', () => {
  it('POSTs the message body and returns the parsed envelope', async () => {
    const envelope = buildEnvelope({
      session: buildSession({ status: 'handed_off' }),
      botMessages: ['Transferring you to the Sales team…'],
      events: [
        { type: 'branch', from: 'n1', to: 'n_buy', condition: 'buyer' },
        { type: 'handoff', nodeId: 'n_buy', team: 'Sales' },
      ],
    });
    const calls: Array<{ url: string; init: RequestInit | undefined }> = [];
    const client = new ApiClient({
      fetch: async (input, init) => {
        calls.push({ url: input as string, init });
        return new Response(JSON.stringify(envelope), { status: 200 });
      },
    });

    const result = await client.stepSession('sess_1', 'buyer');

    expect(result).toEqual(envelope);
    expect(calls[0]!.url).toBe('/api/simulate/sess_1/step');
    expect(JSON.parse(calls[0]!.init!.body as string)).toEqual({ message: 'buyer' });
  });

  it('forwards an AbortSignal to fetch', async () => {
    let observed: AbortSignal | undefined;
    const client = new ApiClient({
      fetch: async (_input, init) => {
        observed = init?.signal ?? undefined;
        return new Response(JSON.stringify(buildEnvelope()), { status: 200 });
      },
    });
    const controller = new AbortController();

    await client.stepSession('sess_1', 'buyer', controller.signal);

    expect(observed).toBe(controller.signal);
  });

  it('throws ApiError(INVALID_INPUT, 400) on validation failure', async () => {
    const client = new ApiClient({
      fetch: jsonFetch(400, { error: { code: 'INVALID_INPUT', message: 'message: required' } }),
    });
    await expect(client.stepSession('sess_1', '')).rejects.toMatchObject({
      code: 'INVALID_INPUT',
      status: 400,
    });
  });

  it('throws ApiError(SESSION_NOT_FOUND, 404) when the session is unknown', async () => {
    const client = new ApiClient({
      fetch: jsonFetch(404, { error: { code: 'SESSION_NOT_FOUND', message: 'gone' } }),
    });
    await expect(client.stepSession('sess_x', 'hi')).rejects.toMatchObject({
      code: 'SESSION_NOT_FOUND',
      status: 404,
    });
  });
});

describe('ApiClient.resetSession', () => {
  it('POSTs (empty body) to /api/simulate/:sessionId/reset and returns the parsed envelope', async () => {
    const envelope = buildEnvelope();
    const calls: Array<{ url: string; init: RequestInit | undefined }> = [];
    const client = new ApiClient({
      fetch: async (input, init) => {
        calls.push({ url: input as string, init });
        return new Response(JSON.stringify(envelope), { status: 200 });
      },
    });

    const result = await client.resetSession('sess_1');

    expect(result).toEqual(envelope);
    expect(calls[0]!.url).toBe('/api/simulate/sess_1/reset');
    expect(calls[0]!.init?.method).toBe('POST');
    expect(calls[0]!.init?.body).toBeUndefined();
  });

  it('throws ApiError(SESSION_NOT_FOUND, 404) when the session is unknown', async () => {
    const client = new ApiClient({
      fetch: jsonFetch(404, { error: { code: 'SESSION_NOT_FOUND', message: 'gone' } }),
    });
    await expect(client.resetSession('sess_x')).rejects.toMatchObject({
      code: 'SESSION_NOT_FOUND',
      status: 404,
    });
  });
});

describe('ApiClient.explainFlow', () => {
  it('POSTs (empty body) to /api/flows/:id/explain and returns the explanation string', async () => {
    const explanation =
      '- When a contact messages, the bot asks buyer or seller.\n- Buyers go to Sales.';
    const calls: Array<{ url: string; init: RequestInit | undefined }> = [];
    const client = new ApiClient({
      fetch: async (input, init) => {
        calls.push({ url: input as string, init });
        return new Response(JSON.stringify({ explanation }), { status: 200 });
      },
    });

    const result = await client.explainFlow('flow_1');

    expect(result).toBe(explanation);
    expect(calls[0]!.url).toBe('/api/flows/flow_1/explain');
    expect(calls[0]!.init?.method).toBe('POST');
    expect(calls[0]!.init?.body).toBeUndefined();
  });

  it('encodes special characters in flowId', async () => {
    const calls: string[] = [];
    const client = new ApiClient({
      fetch: async (input) => {
        calls.push(input as string);
        return new Response(JSON.stringify({ explanation: '- ok' }), { status: 200 });
      },
    });
    await client.explainFlow('flow/with space');
    expect(calls[0]).toBe('/api/flows/flow%2Fwith%20space/explain');
  });

  it('forwards an AbortSignal to fetch', async () => {
    let observed: AbortSignal | undefined;
    const client = new ApiClient({
      fetch: async (_input, init) => {
        observed = init?.signal ?? undefined;
        return new Response(JSON.stringify({ explanation: '- ok ok' }), { status: 200 });
      },
    });
    const controller = new AbortController();
    await client.explainFlow('flow_1', controller.signal);
    expect(observed).toBe(controller.signal);
  });

  it('throws ApiError(FLOW_NOT_FOUND, 404) when the flow is missing', async () => {
    const client = new ApiClient({
      fetch: jsonFetch(404, { error: { code: 'FLOW_NOT_FOUND', message: 'gone' } }),
    });
    await expect(client.explainFlow('flow_x')).rejects.toMatchObject({
      code: 'FLOW_NOT_FOUND',
      status: 404,
    });
  });

  it('throws ApiError(LLM_UNAVAILABLE, 502) when the LLM provider fails', async () => {
    const client = new ApiClient({
      fetch: jsonFetch(502, { error: { code: 'LLM_UNAVAILABLE', message: 'provider down' } }),
    });
    await expect(client.explainFlow('flow_1')).rejects.toMatchObject({
      code: 'LLM_UNAVAILABLE',
      status: 502,
    });
  });

  it('throws ApiError(INVALID_RESPONSE) when 200 body is missing the explanation field', async () => {
    const client = new ApiClient({
      fetch: jsonFetch(200, { somethingElse: 'oops' }),
    });
    await expect(client.explainFlow('flow_1')).rejects.toMatchObject({
      code: 'INVALID_RESPONSE',
    });
  });

  it('throws ApiError(INVALID_RESPONSE) when explanation is an empty string', async () => {
    const client = new ApiClient({
      fetch: jsonFetch(200, { explanation: '' }),
    });
    await expect(client.explainFlow('flow_1')).rejects.toMatchObject({
      code: 'INVALID_RESPONSE',
    });
  });
});

const buildIssue = (overrides: Partial<Issue> = {}): Issue => ({
  severity: 'warning',
  code: 'MISSING_FALLBACK',
  message: 'Ask node has no fallback edge.',
  nodeIds: ['n_ask'],
  ...overrides,
});

const buildReviewResult = (overrides: Partial<ReviewResult> = {}): ReviewResult => ({
  issues: [buildIssue()],
  summary: '1 issue found (1 warning).',
  ...overrides,
});

describe('ApiClient.reviewFlow', () => {
  it('POSTs (empty body) to /api/flows/:id/review and returns the parsed result', async () => {
    const result = buildReviewResult();
    const calls: Array<{ url: string; init: RequestInit | undefined }> = [];
    const client = new ApiClient({
      fetch: async (input, init) => {
        calls.push({ url: input as string, init });
        return new Response(JSON.stringify(result), { status: 200 });
      },
    });

    const parsed = await client.reviewFlow('flow_1');

    expect(parsed).toEqual(result);
    expect(calls[0]!.url).toBe('/api/flows/flow_1/review');
    expect(calls[0]!.init?.method).toBe('POST');
    expect(calls[0]!.init?.body).toBeUndefined();
  });

  it('returns an empty issue list and the canonical "No issues found." summary on a clean flow', async () => {
    const result = buildReviewResult({ issues: [], summary: 'No issues found.' });
    const client = new ApiClient({
      fetch: jsonFetch(200, result),
    });
    const parsed = await client.reviewFlow('flow_1');
    expect(parsed.issues).toEqual([]);
    expect(parsed.summary).toBe('No issues found.');
  });

  it('encodes special characters in flowId', async () => {
    const calls: string[] = [];
    const client = new ApiClient({
      fetch: async (input) => {
        calls.push(input as string);
        return new Response(JSON.stringify(buildReviewResult({ issues: [] })), { status: 200 });
      },
    });
    await client.reviewFlow('flow/with space');
    expect(calls[0]).toBe('/api/flows/flow%2Fwith%20space/review');
  });

  it('forwards an AbortSignal to fetch', async () => {
    let observed: AbortSignal | undefined;
    const client = new ApiClient({
      fetch: async (_input, init) => {
        observed = init?.signal ?? undefined;
        return new Response(JSON.stringify(buildReviewResult({ issues: [] })), { status: 200 });
      },
    });
    const controller = new AbortController();
    await client.reviewFlow('flow_1', controller.signal);
    expect(observed).toBe(controller.signal);
  });

  it('throws ApiError(FLOW_NOT_FOUND, 404) when the flow is missing', async () => {
    const client = new ApiClient({
      fetch: jsonFetch(404, { error: { code: 'FLOW_NOT_FOUND', message: 'gone' } }),
    });
    await expect(client.reviewFlow('flow_x')).rejects.toMatchObject({
      code: 'FLOW_NOT_FOUND',
      status: 404,
    });
  });

  it('throws ApiError(INVALID_RESPONSE) when the body shape does not match ReviewResult', async () => {
    const client = new ApiClient({
      fetch: jsonFetch(200, { issues: 'not-an-array', summary: 'oops' }),
    });
    await expect(client.reviewFlow('flow_1')).rejects.toMatchObject({
      code: 'INVALID_RESPONSE',
    });
  });

  it('throws ApiError(INVALID_RESPONSE) when an issue has an unknown code', async () => {
    const client = new ApiClient({
      fetch: jsonFetch(200, {
        issues: [{ severity: 'error', code: 'TOTALLY_FAKE', message: 'x', nodeIds: [] }],
        summary: '1 issue found (1 error).',
      }),
    });
    await expect(client.reviewFlow('flow_1')).rejects.toMatchObject({
      code: 'INVALID_RESPONSE',
    });
  });
});

describe('ApiClient — Content-Type header', () => {
  // Regression: Fastify 5.x rejects an empty body when `Content-Type:
  // application/json` is set. Body-less POSTs (start / reset / explain /
  // review) must omit the header so the server accepts the request.
  function captureHeaders(): {
    fetchFn: typeof globalThis.fetch;
    calls: Array<{ url: string; init: RequestInit | undefined }>;
  } {
    const calls: Array<{ url: string; init: RequestInit | undefined }> = [];
    const envelope = buildEnvelope();
    const fetchFn: typeof globalThis.fetch = async (input, init) => {
      calls.push({ url: input as string, init });
      return new Response(JSON.stringify(envelope), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    };
    return { fetchFn, calls };
  }

  it('omits Content-Type when POSTing without a body (startSession)', async () => {
    const { fetchFn, calls } = captureHeaders();
    const client = new ApiClient({ fetch: fetchFn });

    await client.startSession('flow_1');

    expect(calls[0]!.init?.method).toBe('POST');
    expect(calls[0]!.init?.body).toBeUndefined();
    expect((calls[0]!.init!.headers as Record<string, string>)['Content-Type']).toBeUndefined();
  });

  it('omits Content-Type for resetSession (body-less POST)', async () => {
    const { fetchFn, calls } = captureHeaders();
    const client = new ApiClient({ fetch: fetchFn });

    await client.resetSession('sess_1');

    expect(calls[0]!.init?.body).toBeUndefined();
    expect((calls[0]!.init!.headers as Record<string, string>)['Content-Type']).toBeUndefined();
  });

  it('still sets Content-Type when there is a body (stepSession)', async () => {
    const { fetchFn, calls } = captureHeaders();
    const client = new ApiClient({ fetch: fetchFn });

    await client.stepSession('sess_1', 'hello');

    expect(calls[0]!.init?.body).toBe(JSON.stringify({ message: 'hello' }));
    expect((calls[0]!.init!.headers as Record<string, string>)['Content-Type']).toBe(
      'application/json',
    );
  });
});
