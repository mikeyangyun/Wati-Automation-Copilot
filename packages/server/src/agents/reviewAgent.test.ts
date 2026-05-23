import type { Flow } from 'shared';
import { describe, expect, it } from 'vitest';

import { MockLLMProvider } from '../llm/mock.js';
import { ReviewAgent } from './reviewAgent.js';

const sampleFlow = (): Flow => ({
  id: 'flow_demo',
  name: 'Buyer / Seller',
  prompt: 'route buyers and sellers',
  trigger: { type: 'new_message' },
  entryNodeId: 'n0',
  nodes: [
    { id: 'n0', type: 'trigger', label: 'Start', config: {} },
    {
      id: 'n1',
      type: 'ask_question',
      label: 'Ask',
      config: { text: 'Are you a buyer or a seller?' },
    },
    { id: 'n_buy', type: 'assign_to_team', label: 'Sales', config: { team: 'Sales' } },
    {
      id: 'n_sell',
      type: 'send_message',
      label: 'Support',
      config: { text: 'Here is our support article.' },
    },
  ],
  edges: [
    { id: 'e0', from: 'n0', to: 'n1' },
    { id: 'e_buy', from: 'n1', to: 'n_buy', condition: 'buyer' },
    { id: 'e_sell', from: 'n1', to: 'n_sell', condition: 'seller' },
  ],
  createdAt: '2026-05-23T10:00:00Z',
});

const validMarkdownBullets = `- When a new contact messages, the bot asks whether they are a buyer or a seller.
- If the user replies "buyer", the bot hands the chat off to the Sales team.
- If the user replies "seller", the bot sends a support article.`;

describe('ReviewAgent.explain — happy paths', () => {
  it('returns the trimmed explanation string on the first attempt', async () => {
    const provider = new MockLLMProvider([validMarkdownBullets]);
    const agent = new ReviewAgent({ provider });
    const result = await agent.explain(sampleFlow());

    expect(result).toBe(validMarkdownBullets);
    expect(provider.callCount).toBe(1);
  });

  it('strips a ```markdown code fence around the payload', async () => {
    const fenced = `\`\`\`markdown\n${validMarkdownBullets}\n\`\`\``;
    const provider = new MockLLMProvider([fenced]);
    const agent = new ReviewAgent({ provider });
    const result = await agent.explain(sampleFlow());
    expect(result).toBe(validMarkdownBullets);
  });

  it('strips a fence without a language tag', async () => {
    const fenced = `\`\`\`\n${validMarkdownBullets}\n\`\`\``;
    const provider = new MockLLMProvider([fenced]);
    const agent = new ReviewAgent({ provider });
    const result = await agent.explain(sampleFlow());
    expect(result).toBe(validMarkdownBullets);
  });

  it('trims surrounding whitespace from the LLM response', async () => {
    const noisy = `   \n${validMarkdownBullets}\n   `;
    const provider = new MockLLMProvider([noisy]);
    const agent = new ReviewAgent({ provider });
    const result = await agent.explain(sampleFlow());
    expect(result).toBe(validMarkdownBullets);
  });
});

describe('ReviewAgent.explain — retry semantics', () => {
  it('retries once when the first response is too short', async () => {
    const provider = new MockLLMProvider(['short.', validMarkdownBullets]);
    const agent = new ReviewAgent({ provider });
    const result = await agent.explain(sampleFlow());
    expect(result).toBe(validMarkdownBullets);
    expect(provider.callCount).toBe(2);
  });

  it('retries once on transport error then returns valid second attempt', async () => {
    const provider = new MockLLMProvider([new Error('socket hang up'), validMarkdownBullets]);
    const agent = new ReviewAgent({ provider });
    const result = await agent.explain(sampleFlow());
    expect(result).toBe(validMarkdownBullets);
    expect(provider.callCount).toBe(2);
  });

  it('throws 502 LLM_UNAVAILABLE when all attempts fail validation', async () => {
    const provider = new MockLLMProvider(['nope', 'still nope']);
    const agent = new ReviewAgent({ provider });
    await expect(agent.explain(sampleFlow())).rejects.toMatchObject({
      code: 'LLM_UNAVAILABLE',
      statusCode: 502,
    });
    expect(provider.callCount).toBe(2);
  });

  it('throws 502 LLM_UNAVAILABLE when all attempts throw at transport layer', async () => {
    const provider = new MockLLMProvider([new Error('socket hang up'), new Error('timeout')]);
    const agent = new ReviewAgent({ provider });
    await expect(agent.explain(sampleFlow())).rejects.toMatchObject({
      code: 'LLM_UNAVAILABLE',
      statusCode: 502,
    });
    expect(provider.callCount).toBe(2);
  });

  it('honours maxRetry=0 (single attempt, no retry)', async () => {
    const provider = new MockLLMProvider(['too short']);
    const agent = new ReviewAgent({ provider, maxRetry: 0 });
    await expect(agent.explain(sampleFlow())).rejects.toMatchObject({
      code: 'LLM_UNAVAILABLE',
    });
    expect(provider.callCount).toBe(1);
  });
});

describe('ReviewAgent.explain — validation gate (BA decision #3)', () => {
  it('rejects an empty string', async () => {
    const provider = new MockLLMProvider(['', validMarkdownBullets]);
    const agent = new ReviewAgent({ provider });
    const result = await agent.explain(sampleFlow());
    expect(result).toBe(validMarkdownBullets);
    expect(provider.callCount).toBe(2);
  });

  it('rejects whitespace-only output as too short', async () => {
    const provider = new MockLLMProvider(['   \n\t  ', 'still nope']);
    const agent = new ReviewAgent({ provider });
    await expect(agent.explain(sampleFlow())).rejects.toMatchObject({
      code: 'LLM_UNAVAILABLE',
    });
  });

  it('rejects output that begins with `{` (JSON dump detection)', async () => {
    const jsonDump = '{"explanation": "the bot asks something then hands off"}';
    const provider = new MockLLMProvider([jsonDump, validMarkdownBullets]);
    const agent = new ReviewAgent({ provider });
    const result = await agent.explain(sampleFlow());
    expect(result).toBe(validMarkdownBullets);
    expect(provider.callCount).toBe(2);
  });

  it('rejects output that begins with `[` (JSON array dump detection)', async () => {
    const jsonDump = '[{"step": "ask buyer or seller"}, {"step": "route"}]';
    const provider = new MockLLMProvider([jsonDump, validMarkdownBullets]);
    const agent = new ReviewAgent({ provider });
    const result = await agent.explain(sampleFlow());
    expect(result).toBe(validMarkdownBullets);
    expect(provider.callCount).toBe(2);
  });

  it('accepts output that starts with non-bracket punctuation (e.g. **bold**)', async () => {
    const validBold = `**Buyer / seller routing**\n\n- When a contact messages, the bot asks whether they are a buyer or seller.\n- Buyers go to Sales.\n- Sellers receive an article.`;
    const provider = new MockLLMProvider([validBold]);
    const agent = new ReviewAgent({ provider });
    const result = await agent.explain(sampleFlow());
    expect(result).toBe(validBold);
  });
});

describe('ReviewAgent.explain — semantic anchors (AC-E2, should-priority)', () => {
  it('explanation against the buyer/seller fixture mentions trigger + branch + handoff terms', async () => {
    const provider = new MockLLMProvider([validMarkdownBullets]);
    const agent = new ReviewAgent({ provider });
    const result = await agent.explain(sampleFlow());
    expect(result.toLowerCase()).toContain('buyer');
    expect(result.toLowerCase()).toContain('seller');
    expect(result.toLowerCase()).toContain('sales');
    expect(result.toLowerCase()).toMatch(/messages|contact|reply/);
  });
});
