import type { Edge, Flow, Node } from 'shared';
import { pino } from 'pino';
import { describe, expect, it } from 'vitest';

import type { FlowGenerator } from '../agents/flowAgent.js';
import type { FlowReviewer } from '../agents/reviewAgent.js';
import { buildApp } from '../app.js';
import { FlowExecutor } from '../executor/flowExecutor.js';
import { InMemoryStore } from '../store/inMemoryStore.js';

const silentLogger = pino({ level: 'silent' });
const fixedNow = () => '2026-05-23T12:00:00.000Z';

const noopAgent: FlowGenerator = {
  generate: async () => {
    throw new Error('simulation route tests do not invoke the agent');
  },
};

const noopReviewer: FlowReviewer = {
  review: async () => {
    throw new Error('simulation.test.ts does not exercise review; unreachable');
  },
  explain: async () => {
    throw new Error('simulation route tests do not invoke the reviewer');
  },
};

const edge = (id: string, from: string, to: string, condition?: string): Edge => ({
  id,
  from,
  to,
  ...(condition !== undefined ? { condition } : {}),
});

const buyerSellerFlow = (id = 'flow_bs'): Flow => ({
  id,
  name: 'BuyerSeller',
  prompt: 'p',
  trigger: { type: 'new_message' },
  entryNodeId: 'n0',
  nodes: [
    { id: 'n0', type: 'trigger', label: 'start', config: {} },
    {
      id: 'n1',
      type: 'ask_question',
      label: 'Q',
      config: { text: 'Buyer or seller?' },
    },
    { id: 'n_buy', type: 'assign_to_team', label: 'sales', config: { team: 'Sales' } } as Node,
    {
      id: 'n_sell',
      type: 'send_message',
      label: 'help',
      config: { text: 'Help article.' },
    } as Node,
  ],
  edges: [
    edge('e0', 'n0', 'n1'),
    edge('e_buy', 'n1', 'n_buy', 'buyer'),
    edge('e_sell', 'n1', 'n_sell', 'seller'),
  ],
  createdAt: '2026-05-23T10:00:00.000Z',
});

async function setup() {
  const store = new InMemoryStore();
  const executor = new FlowExecutor({ store, maxRetry: 2, now: fixedNow });
  const app = await buildApp({
    loggerInstance: silentLogger,
    agent: noopAgent,
    reviewer: noopReviewer,
    executor,
    store,
  });
  return { app, store, executor };
}

describe('POST /api/flows/:id/simulate/start', () => {
  it('creates a session, auto-runs to the first ask_question, returns 200 with envelope', async () => {
    const { app, store } = await setup();
    try {
      const flow = buyerSellerFlow();
      store.saveFlow(flow);

      const res = await app.inject({
        method: 'POST',
        url: `/api/flows/${flow.id}/simulate/start`,
      });
      expect(res.statusCode).toBe(200);
      const body = res.json() as {
        session: { id: string; status: string; currentNodeId: string };
        botMessages: string[];
        events: unknown[];
      };
      expect(body.session.status).toBe('waiting_for_input');
      expect(body.session.currentNodeId).toBe('n1');
      expect(body.botMessages).toEqual(['Buyer or seller?']);
      expect(body.events).toEqual([]);
      expect(store.getSession(body.session.id)).toBeDefined();
    } finally {
      await app.close();
    }
  });

  it('returns 404 FLOW_NOT_FOUND when the flow id is unknown', async () => {
    const { app } = await setup();
    try {
      const res = await app.inject({
        method: 'POST',
        url: '/api/flows/flow_unknown/simulate/start',
      });
      expect(res.statusCode).toBe(404);
      const body = res.json() as { error: { code: string } };
      expect(body.error.code).toBe('FLOW_NOT_FOUND');
    } finally {
      await app.close();
    }
  });
});

describe('POST /api/simulate/:sessionId/step', () => {
  it('routes a "buyer" reply to the Sales handoff and returns 200', async () => {
    const { app, store, executor } = await setup();
    try {
      const flow = buyerSellerFlow();
      store.saveFlow(flow);
      const { session } = executor.createSession(flow);

      const res = await app.inject({
        method: 'POST',
        url: `/api/simulate/${session.id}/step`,
        payload: { message: 'buyer' },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json() as {
        session: { status: string };
        botMessages: string[];
        events: Array<{ type: string }>;
      };
      expect(body.session.status).toBe('handed_off');
      expect(body.botMessages).toEqual(['Transferring you to the Sales team…']);
      expect(body.events.map((e) => e.type)).toEqual(['branch', 'handoff']);
    } finally {
      await app.close();
    }
  });

  it('returns 400 INVALID_INPUT for missing / empty / whitespace messages', async () => {
    const { app, store, executor } = await setup();
    try {
      const flow = buyerSellerFlow();
      store.saveFlow(flow);
      const { session } = executor.createSession(flow);

      const cases: Array<unknown> = [{}, { message: '' }, { message: '   ' }, { message: 42 }];
      for (const payload of cases) {
        const res = await app.inject({
          method: 'POST',
          url: `/api/simulate/${session.id}/step`,
          payload: payload as object,
        });
        expect(res.statusCode).toBe(400);
        const body = res.json() as { error: { code: string } };
        expect(body.error.code).toBe('INVALID_INPUT');
      }
    } finally {
      await app.close();
    }
  });

  it('returns 404 SESSION_NOT_FOUND for an unknown sessionId', async () => {
    const { app } = await setup();
    try {
      const res = await app.inject({
        method: 'POST',
        url: '/api/simulate/sess_unknown/step',
        payload: { message: 'hi' },
      });
      expect(res.statusCode).toBe(404);
      const body = res.json() as { error: { code: string } };
      expect(body.error.code).toBe('SESSION_NOT_FOUND');
    } finally {
      await app.close();
    }
  });

  it('returns 400 INVALID_INPUT when stepping a terminal session', async () => {
    const { app, store, executor } = await setup();
    try {
      const flow = buyerSellerFlow();
      store.saveFlow(flow);
      const { session } = executor.createSession(flow);
      executor.step(session.id, 'buyer'); // handed_off

      const res = await app.inject({
        method: 'POST',
        url: `/api/simulate/${session.id}/step`,
        payload: { message: 'again' },
      });
      expect(res.statusCode).toBe(400);
    } finally {
      await app.close();
    }
  });
});

describe('POST /api/simulate/:sessionId/reset', () => {
  it('clears transcript + retry, returns 200 with the re-run envelope', async () => {
    const { app, store, executor } = await setup();
    try {
      const flow = buyerSellerFlow();
      store.saveFlow(flow);
      const { session } = executor.createSession(flow);
      executor.step(session.id, 'hello'); // produces a fallback retry

      const res = await app.inject({
        method: 'POST',
        url: `/api/simulate/${session.id}/reset`,
      });
      expect(res.statusCode).toBe(200);
      const body = res.json() as {
        session: { id: string; status: string; context: { retryCount: number } };
        botMessages: string[];
      };
      expect(body.session.id).toBe(session.id); // same id
      expect(body.session.context.retryCount).toBe(0);
      expect(body.session.status).toBe('waiting_for_input');
      expect(body.botMessages).toEqual(['Buyer or seller?']);
    } finally {
      await app.close();
    }
  });

  it('returns 404 SESSION_NOT_FOUND for an unknown sessionId', async () => {
    const { app } = await setup();
    try {
      const res = await app.inject({
        method: 'POST',
        url: '/api/simulate/sess_unknown/reset',
      });
      expect(res.statusCode).toBe(404);
      const body = res.json() as { error: { code: string } };
      expect(body.error.code).toBe('SESSION_NOT_FOUND');
    } finally {
      await app.close();
    }
  });
});

describe('Round-trip via HTTP — generate → start → step → reset', () => {
  it('threads buyer → handoff and reset → waiting_for_input over the wire', async () => {
    const { app, store, executor } = await setup();
    try {
      const flow = buyerSellerFlow('flow_roundtrip');
      store.saveFlow(flow);

      const startRes = await app.inject({
        method: 'POST',
        url: `/api/flows/${flow.id}/simulate/start`,
      });
      const startBody = startRes.json() as { session: { id: string } };
      const sid = startBody.session.id;

      const stepRes = await app.inject({
        method: 'POST',
        url: `/api/simulate/${sid}/step`,
        payload: { message: 'buyer' },
      });
      const stepBody = stepRes.json() as { session: { status: string } };
      expect(stepBody.session.status).toBe('handed_off');

      const resetRes = await app.inject({
        method: 'POST',
        url: `/api/simulate/${sid}/reset`,
      });
      const resetBody = resetRes.json() as {
        session: { id: string; status: string };
        botMessages: string[];
      };
      expect(resetBody.session.id).toBe(sid);
      expect(resetBody.session.status).toBe('waiting_for_input');
      expect(resetBody.botMessages).toEqual(['Buyer or seller?']);

      // After reset we can step again.
      const stepRes2 = await app.inject({
        method: 'POST',
        url: `/api/simulate/${sid}/step`,
        payload: { message: 'seller' },
      });
      const stepBody2 = stepRes2.json() as { session: { status: string } };
      expect(stepBody2.session.status).toBe('completed');
      // store reflects the final state
      expect(executor['store'] === store).toBe(true);
    } finally {
      await app.close();
    }
  });
});
