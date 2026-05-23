import type { Edge, Flow, Node } from 'shared';
import { describe, expect, it } from 'vitest';

import { AppError } from '../errors.js';
import { InMemoryStore } from '../store/inMemoryStore.js';
import { FlowExecutor } from './flowExecutor.js';

// ── helpers ─────────────────────────────────────────────────────────────────

const fixedNow = () => '2026-05-23T12:00:00.000Z';

const edge = (id: string, from: string, to: string, condition?: string): Edge => ({
  id,
  from,
  to,
  ...(condition !== undefined ? { condition } : {}),
});

const flowFromParts = (id: string, entryNodeId: string, nodes: Node[], edges: Edge[]): Flow => ({
  id,
  name: 'fx',
  prompt: 'p',
  trigger: { type: 'new_message' },
  entryNodeId,
  nodes,
  edges,
  createdAt: '2026-05-23T10:00:00.000Z',
});

/**
 * Buyer / seller routing reference flow:
 *   trigger → ask_question → (buyer | seller | fallback) → assign / send / re-ask
 */
const buyerSellerFlow = (): Flow =>
  flowFromParts(
    'flow_bs',
    'n0',
    [
      { id: 'n0', type: 'trigger', label: 'start', config: {} },
      {
        id: 'n1',
        type: 'ask_question',
        label: 'Q',
        config: { text: 'Buyer or seller?' },
      },
      { id: 'n_buy', type: 'assign_to_team', label: 'sales', config: { team: 'Sales' } },
      {
        id: 'n_sell',
        type: 'send_message',
        label: 'help',
        config: { text: 'Here is our seller help article.' },
      },
    ],
    [
      edge('e0', 'n0', 'n1'),
      edge('e_buy', 'n1', 'n_buy', 'buyer'),
      edge('e_sell', 'n1', 'n_sell', 'seller'),
    ],
  );

/** Same as above plus an explicit fallback edge that re-asks the question. */
const buyerSellerWithFallback = (): Flow => {
  const f = buyerSellerFlow();
  f.edges.push(edge('e_fb', 'n1', 'n1', 'fallback'));
  return f;
};

const buildExecutor = () => {
  const store = new InMemoryStore();
  const executor = new FlowExecutor({ store, maxRetry: 2, now: fixedNow });
  return { store, executor };
};

// ── tests ───────────────────────────────────────────────────────────────────

describe('FlowExecutor.createSession', () => {
  it('runs from entry until the first ask_question and reports waiting_for_input', () => {
    const { store, executor } = buildExecutor();
    const flow = buyerSellerFlow();
    store.saveFlow(flow);

    const { session, botMessages, events } = executor.createSession(flow);

    expect(session.status).toBe('waiting_for_input');
    expect(session.currentNodeId).toBe('n1');
    expect(botMessages).toEqual(['Buyer or seller?']);
    expect(events).toEqual([]);
    expect(session.transcript).toEqual([
      {
        role: 'bot',
        content: 'Buyer or seller?',
        nodeId: 'n1',
        timestamp: fixedNow(),
      },
    ]);
    // Session is persisted.
    expect(store.getSession(session.id)).toEqual(session);
  });

  it('terminates completed when no ask_question is reached (linear flow)', () => {
    const { store, executor } = buildExecutor();
    const flow = flowFromParts(
      'flow_linear',
      'n0',
      [
        { id: 'n0', type: 'trigger', label: 'start', config: {} },
        { id: 'n1', type: 'send_message', label: 'hi', config: { text: 'Hello.' } },
      ],
      [edge('e0', 'n0', 'n1')],
    );
    store.saveFlow(flow);

    const { session, botMessages } = executor.createSession(flow);

    expect(session.status).toBe('completed');
    expect(botMessages).toEqual(['Hello.']);
  });
});

describe('FlowExecutor.step — buyer / seller happy paths', () => {
  it('routes "buyer" to assign_to_team Sales and lands in handed_off', () => {
    const { store, executor } = buildExecutor();
    const flow = buyerSellerFlow();
    store.saveFlow(flow);
    const start = executor.createSession(flow);

    const { session, botMessages, events } = executor.step(start.session.id, 'buyer');

    expect(session.status).toBe('handed_off');
    expect(botMessages).toEqual(['Transferring you to the Sales team…']);
    expect(events).toEqual([
      { type: 'branch', from: 'n1', to: 'n_buy', condition: 'buyer' },
      { type: 'handoff', nodeId: 'n_buy', team: 'Sales' },
    ]);
  });

  it('routes "seller" to the help article and lands in completed', () => {
    const { store, executor } = buildExecutor();
    const flow = buyerSellerFlow();
    store.saveFlow(flow);
    const start = executor.createSession(flow);

    const { session, botMessages, events } = executor.step(start.session.id, 'seller');

    expect(session.status).toBe('completed');
    expect(botMessages).toEqual(['Here is our seller help article.']);
    expect(events[0]).toEqual({
      type: 'branch',
      from: 'n1',
      to: 'n_sell',
      condition: 'seller',
    });
  });

  it('is case-insensitive on the user reply', () => {
    const { store, executor } = buildExecutor();
    const flow = buyerSellerFlow();
    store.saveFlow(flow);
    const start = executor.createSession(flow);

    const { session } = executor.step(start.session.id, '  BUYER  ');
    expect(session.status).toBe('handed_off');
  });
});

describe('FlowExecutor.step — fallback and retry exhaustion', () => {
  it('falls back, increments retry, re-asks the question, stays waiting_for_input', () => {
    const { store, executor } = buildExecutor();
    const flow = buyerSellerWithFallback();
    store.saveFlow(flow);
    const start = executor.createSession(flow);

    const { session, botMessages, events } = executor.step(start.session.id, 'hello');

    expect(session.status).toBe('waiting_for_input');
    expect(session.context.retryCount).toBe(1);
    expect(botMessages).toEqual(['Buyer or seller?']);
    expect(events.map((e) => e.type)).toEqual(['fallback', 'retry']);
  });

  it('transitions to handed_off (team="human") once retry exceeds the max', () => {
    const { store, executor } = buildExecutor();
    const flow = buyerSellerWithFallback();
    store.saveFlow(flow);
    const start = executor.createSession(flow);

    executor.step(start.session.id, 'huh'); // retry 1
    executor.step(start.session.id, 'huh'); // retry 2
    const out = executor.step(start.session.id, 'huh'); // retry 3 → > maxRetry (2)

    expect(out.session.status).toBe('handed_off');
    expect(out.botMessages).toEqual(["Sorry, I couldn't understand. Transferring you to a human."]);
    expect(out.events.map((e) => e.type)).toEqual(['fallback', 'retry', 'handoff']);
    const handoff = out.events.find((e) => e.type === 'handoff');
    expect(handoff).toMatchObject({ team: 'human' });
  });

  it('without a fallback edge, also stays and retries on unmatched reply', () => {
    const { store, executor } = buildExecutor();
    const flow = buyerSellerFlow(); // no fallback edge
    store.saveFlow(flow);
    const start = executor.createSession(flow);

    const { session, events } = executor.step(start.session.id, 'hello');

    expect(session.status).toBe('waiting_for_input');
    expect(session.context.retryCount).toBe(1);
    expect(events[0]?.type).toBe('fallback');
  });
});

describe('FlowExecutor.step — error mapping', () => {
  it('throws SESSION_NOT_FOUND (404) for an unknown session id', () => {
    const { executor } = buildExecutor();
    expect(() => executor.step('sess_unknown', 'hi')).toThrow(AppError);
    try {
      executor.step('sess_unknown', 'hi');
    } catch (err) {
      expect(err).toMatchObject({ code: 'SESSION_NOT_FOUND', statusCode: 404 });
    }
  });

  it('throws INVALID_INPUT (400) for empty / whitespace messages', () => {
    const { store, executor } = buildExecutor();
    const flow = buyerSellerFlow();
    store.saveFlow(flow);
    const start = executor.createSession(flow);
    try {
      executor.step(start.session.id, '   ');
    } catch (err) {
      expect(err).toMatchObject({ code: 'INVALID_INPUT', statusCode: 400 });
    }
  });

  it('throws INVALID_INPUT (400) when stepping a terminal session', () => {
    const { store, executor } = buildExecutor();
    const flow = buyerSellerFlow();
    store.saveFlow(flow);
    const start = executor.createSession(flow);
    executor.step(start.session.id, 'buyer'); // handed_off
    try {
      executor.step(start.session.id, 'again');
    } catch (err) {
      expect(err).toMatchObject({ code: 'INVALID_INPUT', statusCode: 400 });
    }
  });
});

describe('FlowExecutor.reset', () => {
  it('clears the transcript, retryCount, and re-runs from entry; same sessionId', () => {
    const { store, executor } = buildExecutor();
    const flow = buyerSellerWithFallback();
    store.saveFlow(flow);
    const start = executor.createSession(flow);
    executor.step(start.session.id, 'huh'); // retry=1

    const { session, botMessages } = executor.reset(start.session.id);

    expect(session.id).toBe(start.session.id); // same id
    expect(session.context.retryCount).toBe(0);
    expect(session.currentNodeId).toBe('n1');
    expect(session.status).toBe('waiting_for_input');
    expect(session.transcript).toHaveLength(1); // only the bot question
    expect(botMessages).toEqual(['Buyer or seller?']);
  });

  it('throws SESSION_NOT_FOUND for an unknown id', () => {
    const { executor } = buildExecutor();
    try {
      executor.reset('sess_unknown');
    } catch (err) {
      expect(err).toMatchObject({ code: 'SESSION_NOT_FOUND', statusCode: 404 });
    }
  });
});

describe('FlowExecutor — node-type coverage during auto-run', () => {
  it('emits a mock-api-call event without polluting the transcript', () => {
    const { store, executor } = buildExecutor();
    const flow = flowFromParts(
      'flow_api',
      'n0',
      [
        { id: 'n0', type: 'trigger', label: 'start', config: {} },
        {
          id: 'n_api',
          type: 'api_call',
          label: 'lead',
          config: { url: 'https://example.com/lead', method: 'POST' },
        },
        { id: 'n_end', type: 'send_message', label: 'done', config: { text: 'All set.' } },
      ],
      [edge('e0', 'n0', 'n_api'), edge('e1', 'n_api', 'n_end')],
    );
    store.saveFlow(flow);

    const { session, botMessages, events } = executor.createSession(flow);

    expect(session.status).toBe('completed');
    expect(botMessages).toEqual(['All set.']); // api_call adds nothing to the transcript
    expect(events).toEqual([
      { type: 'mock-api-call', nodeId: 'n_api', url: 'https://example.com/lead' },
    ]);
  });

  it('wait nodes do not delay or emit events', () => {
    const { store, executor } = buildExecutor();
    const flow = flowFromParts(
      'flow_wait',
      'n0',
      [
        { id: 'n0', type: 'trigger', label: 'start', config: {} },
        { id: 'n_w', type: 'wait', label: 'pause', config: { durationMs: 9_999_999 } },
        { id: 'n_end', type: 'send_message', label: 'done', config: { text: 'Done.' } },
      ],
      [edge('e0', 'n0', 'n_w'), edge('e1', 'n_w', 'n_end')],
    );
    store.saveFlow(flow);

    const t0 = Date.now();
    const { session, botMessages } = executor.createSession(flow);
    const elapsed = Date.now() - t0;

    expect(session.status).toBe('completed');
    expect(botMessages).toEqual(['Done.']);
    expect(elapsed).toBeLessThan(50); // no real delay
  });
});

describe('FlowExecutor — safety caps', () => {
  it('throws AppError(500, INTERNAL) when a cyclic flow trips the 100-step cap', () => {
    const { store, executor } = buildExecutor();
    const flow = flowFromParts(
      'flow_cycle',
      'n0',
      [
        { id: 'n0', type: 'trigger', label: 'start', config: {} },
        { id: 'n1', type: 'send_message', label: 'loop', config: { text: '.' } },
      ],
      [edge('e0', 'n0', 'n1'), edge('e1', 'n1', 'n1')], // n1 → n1 forever
    );
    store.saveFlow(flow);

    try {
      executor.createSession(flow);
      throw new Error('expected step-cap exception');
    } catch (err) {
      expect(err).toBeInstanceOf(AppError);
      expect((err as AppError).code).toBe('INTERNAL');
      expect((err as AppError).statusCode).toBe(500);
    }
  });
});
