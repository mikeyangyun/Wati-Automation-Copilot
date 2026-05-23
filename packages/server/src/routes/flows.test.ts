import type { Flow } from 'shared';
import { pino } from 'pino';
import { beforeEach, describe, expect, it } from 'vitest';

import type { FlowGenerator } from '../agents/flowAgent.js';
import { buildApp } from '../app.js';
import { AppError } from '../errors.js';
import { InMemoryStore } from '../store/inMemoryStore.js';

const silentLogger = pino({ level: 'silent' });

const buildSampleFlow = (overrides: Partial<Flow> = {}): Flow => ({
  id: 'flow_sample',
  name: 'Sample',
  prompt: 'sample',
  trigger: { type: 'new_message' },
  entryNodeId: 'n0',
  nodes: [{ id: 'n0', type: 'trigger', label: 'Start', config: {} }],
  edges: [],
  createdAt: '2026-05-23T10:00:00Z',
  ...overrides,
});

class StubAgent implements FlowGenerator {
  public callCount = 0;
  public lastPrompt: string | undefined;

  constructor(
    private readonly behavior: { kind: 'ok'; flow: Flow } | { kind: 'throw'; error: unknown },
  ) {}

  async generate(prompt: string): Promise<Flow> {
    this.callCount += 1;
    this.lastPrompt = prompt;
    if (this.behavior.kind === 'throw') {
      throw this.behavior.error;
    }
    return this.behavior.flow;
  }
}

async function withApp(
  agent: FlowGenerator,
  run: (app: Awaited<ReturnType<typeof buildApp>>, store: InMemoryStore) => Promise<void>,
): Promise<void> {
  const store = new InMemoryStore();
  const app = await buildApp({ loggerInstance: silentLogger, agent, store });
  try {
    await run(app, store);
  } finally {
    await app.close();
  }
}

describe('POST /api/flows/generate — happy path', () => {
  it('returns 200 with the generated flow and saves it to the store', async () => {
    const flow = buildSampleFlow();
    const agent = new StubAgent({ kind: 'ok', flow });

    await withApp(agent, async (app, store) => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/flows/generate',
        payload: { prompt: 'Say hi when a contact messages.' },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ flow });
      expect(agent.callCount).toBe(1);
      expect(agent.lastPrompt).toBe('Say hi when a contact messages.');
      expect(store.getFlow(flow.id)).toEqual(flow);
    });
  });
});

describe('POST /api/flows/generate — body validation (AC2)', () => {
  let agent: StubAgent;
  beforeEach(() => {
    agent = new StubAgent({ kind: 'ok', flow: buildSampleFlow() });
  });

  it.each([
    ['missing body', undefined],
    ['empty object', {}],
    ['missing prompt field', { foo: 'bar' }],
    ['empty prompt string', { prompt: '' }],
    ['non-string prompt', { prompt: 123 }],
  ] as const)(
    'rejects %s with 400 INVALID_INPUT and does not call the agent',
    async (_label, payload) => {
      await withApp(agent, async (app) => {
        const res = await app.inject({
          method: 'POST',
          url: '/api/flows/generate',
          payload: payload as object | undefined,
        });
        expect(res.statusCode).toBe(400);
        const body = res.json() as { error: { code: string } };
        expect(body.error.code).toBe('INVALID_INPUT');
        expect(agent.callCount).toBe(0);
      });
    },
  );

  it('rejects a whitespace-only prompt with 400 (caught by agent layer)', async () => {
    // body Zod passes (length > 0); agent rejects on .trim() being empty.
    await withApp(agent, async (app) => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/flows/generate',
        payload: { prompt: '   \n\t  ' },
      });
      expect(res.statusCode).toBe(400);
      const body = res.json() as { error: { code: string } };
      expect(body.error.code).toBe('INVALID_INPUT');
    });
  });
});

describe('POST /api/flows/generate — agent error mapping', () => {
  it('AC3 — maps AppError(LLM_OUTPUT_INVALID, 422) from agent to 422 response', async () => {
    const agent = new StubAgent({
      kind: 'throw',
      error: new AppError(
        'LLM_OUTPUT_INVALID',
        'LLM output failed schema validation after 2 attempt(s)',
        422,
      ),
    });
    await withApp(agent, async (app, store) => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/flows/generate',
        payload: { prompt: 'hi' },
      });
      expect(res.statusCode).toBe(422);
      const body = res.json() as { error: { code: string } };
      expect(body.error.code).toBe('LLM_OUTPUT_INVALID');
      // store untouched on failure
      expect(store.getFlow('flow_sample')).toBeUndefined();
    });
  });

  it('AC5 — maps AppError(LLM_UNAVAILABLE, 502) from agent to 502 response', async () => {
    const agent = new StubAgent({
      kind: 'throw',
      error: new AppError('LLM_UNAVAILABLE', 'LLM provider error: socket hang up', 502),
    });
    await withApp(agent, async (app) => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/flows/generate',
        payload: { prompt: 'hi' },
      });
      expect(res.statusCode).toBe(502);
      const body = res.json() as { error: { code: string } };
      expect(body.error.code).toBe('LLM_UNAVAILABLE');
    });
  });

  it('maps an unexpected (non-AppError) throw from agent to 500 INTERNAL', async () => {
    const agent = new StubAgent({ kind: 'throw', error: new Error('boom') });
    await withApp(agent, async (app) => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/flows/generate',
        payload: { prompt: 'hi' },
      });
      expect(res.statusCode).toBe(500);
      const body = res.json() as { error: { code: string } };
      expect(body.error.code).toBe('INTERNAL');
    });
  });
});
