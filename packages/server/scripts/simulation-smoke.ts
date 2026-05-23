/**
 * End-to-end smoke harness for the simulation HTTP pipeline.
 *
 * Boots the real Fastify app (with a stubbed FlowGenerator, since simulation
 * does not exercise the LLM) and walks every canonical simulation path via
 * `app.inject`. Prints a pass/fail line per case plus a summary at the end.
 *
 * Use cases:
 *   - Pre-release smoke (gate before tagging a build)
 *   - Reproducible regression check after touching `executor/` or `routes/`
 *
 * Run:   pnpm --filter server exec tsx scripts/simulation-smoke.ts
 *
 * Exit codes: 0 on full pass, 1 on any case failing, 2 on harness crash.
 */
import { pino } from 'pino';
import type { Flow } from 'shared';

import type { FlowGenerator } from '../src/agents/flowAgent.js';
import type { FlowReviewer } from '../src/agents/reviewAgent.js';
import { buildApp } from '../src/app.js';
import { FlowExecutor } from '../src/executor/flowExecutor.js';
import { InMemoryStore } from '../src/store/inMemoryStore.js';

const logger = pino({ level: 'silent' });

const BUYER_SELLER_FLOW: Flow = {
  id: 'flow_buyer_seller',
  name: 'Buyer / Seller Router',
  prompt: 'When a new contact messages us, ask if they are a buyer or seller.',
  trigger: { type: 'new_message' },
  entryNodeId: 'n_trigger',
  nodes: [
    { id: 'n_trigger', type: 'trigger', label: 'New message', config: {} },
    {
      id: 'n_ask',
      type: 'ask_question',
      label: 'Buyer or seller?',
      config: { text: 'Are you a buyer or a seller?' },
    },
    {
      id: 'n_sales',
      type: 'assign_to_team',
      label: 'Sales handoff',
      config: { team: 'Sales' },
    },
    {
      id: 'n_support',
      type: 'send_message',
      label: 'Send support article',
      config: { text: "Here's our support center: https://support.example.com" },
    },
  ],
  edges: [
    { id: 'e0', from: 'n_trigger', to: 'n_ask' },
    { id: 'e_buy', from: 'n_ask', to: 'n_sales', condition: 'buyer' },
    { id: 'e_sell', from: 'n_ask', to: 'n_support', condition: 'seller' },
  ],
  createdAt: '2026-05-23T10:00:00.000Z',
};

const stubAgent: FlowGenerator = {
  generate: async () => {
    throw new Error('QA smoke does not exercise generate; this stub is unreachable');
  },
};

const stubReviewer: FlowReviewer = {
  explain: async () => {
    throw new Error('QA smoke does not exercise explain; this stub is unreachable');
  },
};

interface CaseResult {
  name: string;
  ok: boolean;
  details: string;
}

const results: CaseResult[] = [];

function record(name: string, ok: boolean, details = ''): void {
  results.push({ name, ok, details });
  const tag = ok ? 'PASS' : 'FAIL';
  console.log(`[${tag}] ${name}${details ? ` — ${details}` : ''}`);
}

interface EnvelopeShape {
  session: {
    id: string;
    status: 'running' | 'waiting_for_input' | 'completed' | 'handed_off';
    currentNodeId: string;
    transcript: Array<{ role: 'bot' | 'user'; content: string }>;
    context: { retryCount: number };
  };
  botMessages: string[];
  events: Array<{ type: string; [k: string]: unknown }>;
}

async function main(): Promise<number> {
  const store = new InMemoryStore();
  store.saveFlow(BUYER_SELLER_FLOW);
  const executor = new FlowExecutor({ store, maxRetry: 2 });
  const app = await buildApp({
    loggerInstance: logger,
    agent: stubAgent,
    reviewer: stubReviewer,
    executor,
    store,
  });

  try {
    // -------------------------------------------------------------------
    // 1. start → status 'waiting_for_input', first bot message rendered
    // -------------------------------------------------------------------
    const startRes = await app.inject({
      method: 'POST',
      url: `/api/flows/${BUYER_SELLER_FLOW.id}/simulate/start`,
    });
    const startBody = startRes.json() as EnvelopeShape;
    record(
      'start: returns 200 + waiting_for_input + first bot message',
      startRes.statusCode === 200 &&
        startBody.session.status === 'waiting_for_input' &&
        startBody.session.currentNodeId === 'n_ask' &&
        startBody.botMessages[0]?.includes('Are you a buyer or a seller?') === true,
      `status=${startRes.statusCode}, sess.status=${startBody.session.status}, ` +
        `currentNodeId=${startBody.session.currentNodeId}, botMessages=${JSON.stringify(
          startBody.botMessages,
        )}`,
    );
    const sid = startBody.session.id;

    // -------------------------------------------------------------------
    // 2. step "buyer" → handed_off, branch event + handoff event
    // -------------------------------------------------------------------
    const buyerRes = await app.inject({
      method: 'POST',
      url: `/api/simulate/${sid}/step`,
      payload: { message: 'buyer' },
    });
    const buyerBody = buyerRes.json() as EnvelopeShape;
    const eventTypes = buyerBody.events.map((e) => e.type);
    record(
      'step buyer: routed to Sales handoff with branch + handoff events',
      buyerRes.statusCode === 200 &&
        buyerBody.session.status === 'handed_off' &&
        eventTypes.includes('branch') &&
        eventTypes.includes('handoff'),
      `events=${JSON.stringify(eventTypes)}, status=${buyerBody.session.status}`,
    );

    // -------------------------------------------------------------------
    // 3. reset → same sessionId, transcript trimmed, status back to waiting
    // -------------------------------------------------------------------
    const resetRes = await app.inject({
      method: 'POST',
      url: `/api/simulate/${sid}/reset`,
    });
    const resetBody = resetRes.json() as EnvelopeShape;
    record(
      'reset: same sessionId, transcript reset, status waiting_for_input',
      resetRes.statusCode === 200 &&
        resetBody.session.id === sid &&
        resetBody.session.status === 'waiting_for_input' &&
        resetBody.session.context.retryCount === 0 &&
        // post-reset transcript holds exactly the entry bot message
        resetBody.session.transcript.filter((m) => m.role === 'user').length === 0 &&
        resetBody.session.transcript.some((m) => m.role === 'bot' && m.content.includes('buyer')),
      `sid same=${resetBody.session.id === sid}, retryCount=${resetBody.session.context.retryCount}`,
    );

    // -------------------------------------------------------------------
    // 4. seller path → completed (send_message terminal)
    // -------------------------------------------------------------------
    const sellerRes = await app.inject({
      method: 'POST',
      url: `/api/simulate/${sid}/step`,
      payload: { message: '  SELLER  ' }, // verifies case-insensitive + trim
    });
    const sellerBody = sellerRes.json() as EnvelopeShape;
    record(
      'step "  SELLER  ": case-insensitive + trim → support, status completed',
      sellerRes.statusCode === 200 &&
        sellerBody.session.status === 'completed' &&
        sellerBody.botMessages.some((m) => m.includes('support')) &&
        sellerBody.events.some((e) => e.type === 'branch'),
      `status=${sellerBody.session.status}, botMessages=${JSON.stringify(sellerBody.botMessages)}`,
    );

    // -------------------------------------------------------------------
    // 5. fallback → retry → retry-exhausted → handoff to 'human'
    // -------------------------------------------------------------------
    // Fresh session for clean retry counter
    const start2Res = await app.inject({
      method: 'POST',
      url: `/api/flows/${BUYER_SELLER_FLOW.id}/simulate/start`,
    });
    const start2Body = start2Res.json() as EnvelopeShape;
    const sid2 = start2Body.session.id;

    const r1 = (
      await app.inject({
        method: 'POST',
        url: `/api/simulate/${sid2}/step`,
        payload: { message: 'xyz' },
      })
    ).json() as EnvelopeShape;
    const r2 = (
      await app.inject({
        method: 'POST',
        url: `/api/simulate/${sid2}/step`,
        payload: { message: 'still nope' },
      })
    ).json() as EnvelopeShape;
    const r3 = (
      await app.inject({
        method: 'POST',
        url: `/api/simulate/${sid2}/step`,
        payload: { message: 'help?' },
      })
    ).json() as EnvelopeShape;

    const r1HasFallback = r1.events.some((e) => e.type === 'fallback');
    const r2HasRetry = r2.events.some((e) => e.type === 'retry');
    const r3HandoffToHuman =
      r3.session.status === 'handed_off' &&
      r3.events.some((e) => e.type === 'handoff' && (e as { team?: string }).team === 'human');
    record(
      'fallback → retry → exhaustion → handoff to "human"',
      r1HasFallback && r2HasRetry && r3HandoffToHuman,
      `r1 fallback=${r1HasFallback}, r2 retry=${r2HasRetry}, r3 handoff(human)=${r3HandoffToHuman}, r3.status=${r3.session.status}`,
    );

    // -------------------------------------------------------------------
    // 6. Error contracts: unknown flow / session / empty message
    // -------------------------------------------------------------------
    const unknownFlow = await app.inject({
      method: 'POST',
      url: '/api/flows/flow_zzz/simulate/start',
    });
    record(
      'error: unknown flow → 404 FLOW_NOT_FOUND',
      unknownFlow.statusCode === 404 &&
        (unknownFlow.json() as { error: { code: string } }).error.code === 'FLOW_NOT_FOUND',
    );

    const unknownSess = await app.inject({
      method: 'POST',
      url: '/api/simulate/sess_zzz/step',
      payload: { message: 'hi' },
    });
    record(
      'error: unknown session → 404 SESSION_NOT_FOUND',
      unknownSess.statusCode === 404 &&
        (unknownSess.json() as { error: { code: string } }).error.code === 'SESSION_NOT_FOUND',
    );

    const emptyMsg = await app.inject({
      method: 'POST',
      url: `/api/simulate/${sid}/step`,
      payload: { message: '   ' },
    });
    record(
      'error: whitespace-only message → 400 INVALID_INPUT',
      emptyMsg.statusCode === 400 &&
        (emptyMsg.json() as { error: { code: string } }).error.code === 'INVALID_INPUT',
    );

    // -------------------------------------------------------------------
    // 7. Determinism: same input twice → identical outputs (modulo session id + timestamps)
    // -------------------------------------------------------------------
    const detSidA = (
      (
        await app.inject({
          method: 'POST',
          url: `/api/flows/${BUYER_SELLER_FLOW.id}/simulate/start`,
        })
      ).json() as EnvelopeShape
    ).session.id;
    const detA = (
      await app.inject({
        method: 'POST',
        url: `/api/simulate/${detSidA}/step`,
        payload: { message: 'buyer' },
      })
    ).json() as EnvelopeShape;

    const detSidB = (
      (
        await app.inject({
          method: 'POST',
          url: `/api/flows/${BUYER_SELLER_FLOW.id}/simulate/start`,
        })
      ).json() as EnvelopeShape
    ).session.id;
    const detB = (
      await app.inject({
        method: 'POST',
        url: `/api/simulate/${detSidB}/step`,
        payload: { message: 'buyer' },
      })
    ).json() as EnvelopeShape;

    const sameEvents = JSON.stringify(detA.events) === JSON.stringify(detB.events);
    const sameBotMessages = JSON.stringify(detA.botMessages) === JSON.stringify(detB.botMessages);
    record(
      'determinism: two sessions, same "buyer" reply → identical events + botMessages',
      sameEvents && sameBotMessages,
      `sameEvents=${sameEvents}, sameBotMessages=${sameBotMessages}`,
    );
  } finally {
    await app.close();
  }

  const passed = results.filter((r) => r.ok).length;
  const failed = results.length - passed;
  console.log(`\nSummary: ${passed}/${results.length} passed${failed ? `, ${failed} FAILED` : ''}`);
  return failed === 0 ? 0 : 1;
}

main().then(
  (code) => process.exit(code),
  (err) => {
    console.error('QA smoke crashed:', err);
    process.exit(2);
  },
);
