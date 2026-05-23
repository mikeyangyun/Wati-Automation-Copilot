import type { Flow, Issue } from 'shared';
import { pino } from 'pino';
import { beforeEach, describe, expect, it } from 'vitest';

import type { FlowGenerator } from '../agents/flowAgent.js';
import type { FlowReviewer } from '../agents/reviewAgent.js';
import { buildApp } from '../app.js';
import { AppError } from '../errors.js';
import { InMemoryStore } from '../store/inMemoryStore.js';

const silentLogger = pino({ level: 'silent' });

const noopReviewer: FlowReviewer = {
  explain: async () => {
    throw new Error('flows.test.ts does not exercise explain; this stub is unreachable');
  },
  review: async () => {
    throw new Error('flows.test.ts does not exercise review; this stub is unreachable');
  },
};

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
  const app = await buildApp({
    loggerInstance: silentLogger,
    agent,
    reviewer: noopReviewer,
    store,
  });
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

describe('GET /api/flows/:id', () => {
  const noopAgent: FlowGenerator = {
    generate: async () => {
      throw new Error('GET tests do not invoke the agent');
    },
  };

  it('returns 200 with the stored flow', async () => {
    const flow = buildSampleFlow({ id: 'flow_known' });
    await withApp(noopAgent, async (app, store) => {
      store.saveFlow(flow);
      const res = await app.inject({ method: 'GET', url: '/api/flows/flow_known' });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ flow });
    });
  });

  it('returns 404 FLOW_NOT_FOUND when the id is unknown', async () => {
    await withApp(noopAgent, async (app) => {
      const res = await app.inject({ method: 'GET', url: '/api/flows/flow_does_not_exist' });
      expect(res.statusCode).toBe(404);
      const body = res.json() as { error: { code: string; message: string } };
      expect(body.error.code).toBe('FLOW_NOT_FOUND');
      expect(body.error.message).toContain('flow_does_not_exist');
    });
  });

  it('round-trip: POST /generate then GET /:id returns the same flow', async () => {
    const flow = buildSampleFlow({ id: 'flow_roundtrip' });
    const agent = new StubAgent({ kind: 'ok', flow });
    await withApp(agent, async (app) => {
      const postRes = await app.inject({
        method: 'POST',
        url: '/api/flows/generate',
        payload: { prompt: 'roundtrip prompt' },
      });
      expect(postRes.statusCode).toBe(200);

      const getRes = await app.inject({ method: 'GET', url: `/api/flows/${flow.id}` });
      expect(getRes.statusCode).toBe(200);
      expect(getRes.json()).toEqual({ flow });
    });
  });
});

// ---------------------------------------------------------------------------
// POST /api/flows/:id/explain
// ---------------------------------------------------------------------------

class StubReviewer implements FlowReviewer {
  public callCount = 0;
  public lastFlowId: string | undefined;

  constructor(
    private readonly behavior:
      | { kind: 'ok'; explanation: string }
      | { kind: 'throw'; error: unknown },
  ) {}

  async explain(flow: Flow): Promise<string> {
    this.callCount += 1;
    this.lastFlowId = flow.id;
    if (this.behavior.kind === 'throw') {
      throw this.behavior.error;
    }
    return this.behavior.explanation;
  }

  async review(_flow: Flow): Promise<never> {
    throw new Error('StubReviewer.review is unreachable in explain tests');
  }
}

const noopAgentForExplain: FlowGenerator = {
  generate: async () => {
    throw new Error('explain tests do not invoke the generator');
  },
};

async function withReviewerApp(
  reviewer: FlowReviewer,
  run: (app: Awaited<ReturnType<typeof buildApp>>, store: InMemoryStore) => Promise<void>,
): Promise<void> {
  const store = new InMemoryStore();
  const app = await buildApp({
    loggerInstance: silentLogger,
    agent: noopAgentForExplain,
    reviewer,
    store,
  });
  try {
    await run(app, store);
  } finally {
    await app.close();
  }
}

describe('POST /api/flows/:id/explain — happy path', () => {
  it('returns 200 with { explanation } and calls reviewer with the stored flow', async () => {
    const flow = buildSampleFlow({ id: 'flow_explain_1' });
    const reviewer = new StubReviewer({
      kind: 'ok',
      explanation: '- When a contact messages, the bot says hello.',
    });

    await withReviewerApp(reviewer, async (app, store) => {
      store.saveFlow(flow);
      const res = await app.inject({
        method: 'POST',
        url: '/api/flows/flow_explain_1/explain',
      });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({
        explanation: '- When a contact messages, the bot says hello.',
      });
      expect(reviewer.callCount).toBe(1);
      expect(reviewer.lastFlowId).toBe('flow_explain_1');
    });
  });
});

describe('POST /api/flows/:id/explain — error paths', () => {
  it('returns 404 FLOW_NOT_FOUND when the flow id is unknown', async () => {
    const reviewer = new StubReviewer({ kind: 'ok', explanation: '- ignored' });

    await withReviewerApp(reviewer, async (app) => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/flows/flow_does_not_exist/explain',
      });
      expect(res.statusCode).toBe(404);
      const body = res.json() as { error: { code: string; message: string } };
      expect(body.error.code).toBe('FLOW_NOT_FOUND');
      expect(body.error.message).toContain('flow_does_not_exist');
      expect(reviewer.callCount).toBe(0);
    });
  });

  it('maps an AppError(502, LLM_UNAVAILABLE) from reviewer to the same envelope', async () => {
    const flow = buildSampleFlow({ id: 'flow_explain_502' });
    const reviewer = new StubReviewer({
      kind: 'throw',
      error: new AppError('LLM_UNAVAILABLE', 'provider down', 502),
    });

    await withReviewerApp(reviewer, async (app, store) => {
      store.saveFlow(flow);
      const res = await app.inject({
        method: 'POST',
        url: '/api/flows/flow_explain_502/explain',
      });
      expect(res.statusCode).toBe(502);
      const body = res.json() as { error: { code: string; message: string } };
      expect(body.error.code).toBe('LLM_UNAVAILABLE');
      expect(body.error.message).toBe('provider down');
    });
  });

  it('maps an unexpected (non-AppError) reviewer throw to 500 INTERNAL', async () => {
    const flow = buildSampleFlow({ id: 'flow_explain_500' });
    const reviewer = new StubReviewer({
      kind: 'throw',
      error: new Error('reviewer exploded'),
    });

    await withReviewerApp(reviewer, async (app, store) => {
      store.saveFlow(flow);
      const res = await app.inject({
        method: 'POST',
        url: '/api/flows/flow_explain_500/explain',
      });
      expect(res.statusCode).toBe(500);
      const body = res.json() as { error: { code: string } };
      expect(body.error.code).toBe('INTERNAL');
    });
  });
});

// ---------------------------------------------------------------------------
// POST /api/flows/:id/review
// ---------------------------------------------------------------------------

class StubReviewerForReview implements FlowReviewer {
  public reviewCallCount = 0;
  public lastReviewFlowId: string | undefined;

  constructor(
    private readonly behavior: { kind: 'ok'; issues: Issue[] } | { kind: 'throw'; error: unknown },
  ) {}

  async explain(): Promise<string> {
    throw new Error('review-route tests do not exercise explain');
  }

  async review(flow: Flow): Promise<Issue[]> {
    this.reviewCallCount += 1;
    this.lastReviewFlowId = flow.id;
    if (this.behavior.kind === 'throw') {
      throw this.behavior.error;
    }
    return this.behavior.issues;
  }
}

function completeFlowFixture(overrides: Partial<Flow> = {}): Flow {
  return {
    id: 'flow_review_ok',
    name: 'Buyer / Seller',
    prompt: 'route buyers and sellers',
    trigger: { type: 'new_message' },
    entryNodeId: 'n_start',
    nodes: [
      { id: 'n_start', type: 'trigger', label: 'Start', config: {} },
      {
        id: 'n_ask',
        type: 'ask_question',
        label: 'Ask',
        config: { text: 'Are you a buyer or seller?' },
      },
      { id: 'n_sales', type: 'assign_to_team', label: 'Sales', config: { team: 'Sales' } },
      { id: 'n_default', type: 'assign_to_team', label: 'Default', config: { team: 'Support' } },
    ],
    edges: [
      { id: 'e0', from: 'n_start', to: 'n_ask' },
      { id: 'e_buy', from: 'n_ask', to: 'n_sales', condition: 'buyer' },
      { id: 'e_default', from: 'n_ask', to: 'n_default' },
    ],
    createdAt: '2026-05-23T10:00:00Z',
    ...overrides,
  };
}

function missingFallbackFixture(): Flow {
  const flow = completeFlowFixture({ id: 'flow_missing_fb' });
  // Strip both the fallback edge and the node it pointed at — keeping just
  // the node would surface an UNREACHABLE_NODE warning we are not asserting on
  // here.
  flow.edges = flow.edges.filter((e) => e.id !== 'e_default');
  flow.nodes = flow.nodes.filter((n) => n.id !== 'n_default');
  return flow;
}

describe('POST /api/flows/:id/review — happy path', () => {
  it('returns 200 with empty issues and "No issues found." for a clean flow', async () => {
    const flow = completeFlowFixture();
    const reviewer = new StubReviewerForReview({ kind: 'ok', issues: [] });

    await withReviewerApp(reviewer, async (app, store) => {
      store.saveFlow(flow);
      const res = await app.inject({
        method: 'POST',
        url: `/api/flows/${flow.id}/review`,
      });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ issues: [], summary: 'No issues found.' });
      expect(reviewer.reviewCallCount).toBe(1);
      expect(reviewer.lastReviewFlowId).toBe(flow.id);
    });
  });

  it('includes structural findings for a defective flow', async () => {
    const flow = missingFallbackFixture();
    const reviewer = new StubReviewerForReview({ kind: 'ok', issues: [] });

    await withReviewerApp(reviewer, async (app, store) => {
      store.saveFlow(flow);
      const res = await app.inject({
        method: 'POST',
        url: `/api/flows/${flow.id}/review`,
      });
      expect(res.statusCode).toBe(200);
      const body = res.json() as { issues: Issue[]; summary: string };
      expect(body.issues).toHaveLength(1);
      expect(body.issues[0]).toMatchObject({
        severity: 'warning',
        code: 'MISSING_FALLBACK',
        nodeIds: ['n_ask'],
      });
      expect(body.summary).toBe('1 issue found (1 warning).');
    });
  });
});

describe('POST /api/flows/:id/review — merge', () => {
  it('drops a semantic issue that lands on a structurally-flagged node', async () => {
    const flow = missingFallbackFixture();
    const semantic: Issue = {
      severity: 'info',
      code: 'UNCLEAR_QUESTION',
      message: 'The ask_question text is compound.',
      nodeIds: ['n_ask'],
    };
    const reviewer = new StubReviewerForReview({ kind: 'ok', issues: [semantic] });

    await withReviewerApp(reviewer, async (app, store) => {
      store.saveFlow(flow);
      const res = await app.inject({
        method: 'POST',
        url: `/api/flows/${flow.id}/review`,
      });
      const body = res.json() as { issues: Issue[]; summary: string };
      expect(body.issues).toHaveLength(1);
      expect(body.issues[0]!.code).toBe('MISSING_FALLBACK');
    });
  });

  it('keeps flow-level semantic findings even when structural is non-empty', async () => {
    const flow = missingFallbackFixture();
    const semantic: Issue = {
      severity: 'warning',
      code: 'MISSING_BRANCH',
      message: 'The prompt mentions VIP customers but no node covers them.',
      nodeIds: [],
    };
    const reviewer = new StubReviewerForReview({ kind: 'ok', issues: [semantic] });

    await withReviewerApp(reviewer, async (app, store) => {
      store.saveFlow(flow);
      const res = await app.inject({
        method: 'POST',
        url: `/api/flows/${flow.id}/review`,
      });
      const body = res.json() as { issues: Issue[]; summary: string };
      expect(body.issues).toHaveLength(2);
      expect(body.summary).toBe('2 issues found (2 warnings).');
    });
  });
});

describe('POST /api/flows/:id/review — LLM degradation', () => {
  it('returns 200 with SEMANTIC_REVIEW_UNAVAILABLE info issue when reviewer throws', async () => {
    const flow = completeFlowFixture({ id: 'flow_review_llm_down' });
    const reviewer = new StubReviewerForReview({
      kind: 'throw',
      error: new AppError('LLM_UNAVAILABLE', 'provider down', 502),
    });

    await withReviewerApp(reviewer, async (app, store) => {
      store.saveFlow(flow);
      const res = await app.inject({
        method: 'POST',
        url: `/api/flows/${flow.id}/review`,
      });
      expect(res.statusCode).toBe(200);
      const body = res.json() as { issues: Issue[]; summary: string };
      expect(body.issues).toHaveLength(1);
      expect(body.issues[0]).toMatchObject({
        severity: 'info',
        code: 'SEMANTIC_REVIEW_UNAVAILABLE',
      });
      expect(body.summary).toBe('1 issue found (1 info).');
    });
  });

  it('returns 200 with structural + SEMANTIC_REVIEW_UNAVAILABLE when both signals present', async () => {
    const flow = missingFallbackFixture();
    const reviewer = new StubReviewerForReview({
      kind: 'throw',
      error: new Error('transport blew up'),
    });

    await withReviewerApp(reviewer, async (app, store) => {
      store.saveFlow(flow);
      const res = await app.inject({
        method: 'POST',
        url: `/api/flows/${flow.id}/review`,
      });
      expect(res.statusCode).toBe(200);
      const body = res.json() as { issues: Issue[]; summary: string };
      expect(body.issues).toHaveLength(2);
      const codes = body.issues.map((i) => i.code);
      expect(codes).toContain('MISSING_FALLBACK');
      expect(codes).toContain('SEMANTIC_REVIEW_UNAVAILABLE');
      expect(body.summary).toBe('2 issues found (1 warning, 1 info).');
    });
  });
});

describe('POST /api/flows/:id/review — error paths', () => {
  it('returns 404 FLOW_NOT_FOUND when the flow id is unknown and does not call reviewer', async () => {
    const reviewer = new StubReviewerForReview({ kind: 'ok', issues: [] });

    await withReviewerApp(reviewer, async (app) => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/flows/flow_does_not_exist/review',
      });
      expect(res.statusCode).toBe(404);
      const body = res.json() as { error: { code: string; message: string } };
      expect(body.error.code).toBe('FLOW_NOT_FOUND');
      expect(reviewer.reviewCallCount).toBe(0);
    });
  });
});
