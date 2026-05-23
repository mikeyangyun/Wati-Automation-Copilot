import { FlowSchema } from 'shared';
import { describe, expect, it } from 'vitest';

import { MockLLMProvider } from '../llm/mock.js';
import { FlowAgent } from './flowAgent.js';

const fixedNow = (): string => '2026-05-23T10:00:00Z';

const buildDraftJson = (overrides: Record<string, unknown> = {}): string =>
  JSON.stringify({
    name: 'Echo',
    trigger: { type: 'new_message' },
    entryNodeId: 'n0',
    nodes: [{ id: 'n0', type: 'trigger', label: 'Start', config: {} }],
    edges: [],
    ...overrides,
  });

describe('FlowAgent.generate — happy paths', () => {
  it('produces a FlowSchema-valid Flow with server-supplied id/prompt/createdAt', async () => {
    const provider = new MockLLMProvider([buildDraftJson()]);
    const agent = new FlowAgent({ provider, now: fixedNow });
    const flow = await agent.generate('Say hi when a contact messages.');

    expect(FlowSchema.safeParse(flow).success).toBe(true);
    expect(flow.id).toMatch(/^flow_/);
    expect(flow.prompt).toBe('Say hi when a contact messages.');
    expect(flow.createdAt).toBe('2026-05-23T10:00:00Z');
    expect(flow.name).toBe('Echo');
    expect(provider.callCount).toBe(1);
  });

  it('strips a ```json code fence around the payload', async () => {
    const fenced = `\`\`\`json\n${buildDraftJson()}\n\`\`\``;
    const provider = new MockLLMProvider([fenced]);
    const agent = new FlowAgent({ provider, now: fixedNow });
    const flow = await agent.generate('hi');
    expect(flow.name).toBe('Echo');
  });

  it('strips a fence without a language tag', async () => {
    const fenced = `\`\`\`\n${buildDraftJson()}\n\`\`\``;
    const provider = new MockLLMProvider([fenced]);
    const agent = new FlowAgent({ provider, now: fixedNow });
    const flow = await agent.generate('hi');
    expect(flow.name).toBe('Echo');
  });

  it('generates a unique flow.id on each call', async () => {
    const provider = new MockLLMProvider([buildDraftJson(), buildDraftJson()]);
    const agent = new FlowAgent({ provider, now: fixedNow });
    const a = await agent.generate('hi');
    const b = await agent.generate('hi');
    expect(a.id).not.toBe(b.id);
  });
});

describe('FlowAgent.generate — retry semantics (AC3, AC4)', () => {
  it('AC4 — retries once when the first response fails JSON.parse', async () => {
    const provider = new MockLLMProvider(['this is not json', buildDraftJson()]);
    const agent = new FlowAgent({ provider, now: fixedNow });
    const flow = await agent.generate('hi');
    expect(flow.name).toBe('Echo');
    expect(provider.callCount).toBe(2);
  });

  it('AC4 — retries once when the first response fails FlowSchema', async () => {
    const provider = new MockLLMProvider([
      JSON.stringify({ name: '', trigger: { type: 'cron' } }), // schema-invalid
      buildDraftJson(),
    ]);
    const agent = new FlowAgent({ provider, now: fixedNow });
    const flow = await agent.generate('hi');
    expect(flow.id).toMatch(/^flow_/);
    expect(provider.callCount).toBe(2);
  });

  it('AC3 — throws 422 LLM_OUTPUT_INVALID when both attempts fail', async () => {
    const provider = new MockLLMProvider(['nope', 'still nope']);
    const agent = new FlowAgent({ provider, now: fixedNow });
    await expect(agent.generate('hi')).rejects.toMatchObject({
      code: 'LLM_OUTPUT_INVALID',
      statusCode: 422,
    });
    expect(provider.callCount).toBe(2);
  });

  it('honours maxRetry=0 (one attempt only)', async () => {
    const provider = new MockLLMProvider(['nope']);
    const agent = new FlowAgent({ provider, maxRetry: 0, now: fixedNow });
    await expect(agent.generate('hi')).rejects.toMatchObject({
      code: 'LLM_OUTPUT_INVALID',
    });
    expect(provider.callCount).toBe(1);
  });

  it('honours maxRetry=2 (three total attempts)', async () => {
    const provider = new MockLLMProvider(['x', 'y', buildDraftJson()]);
    const agent = new FlowAgent({ provider, maxRetry: 2, now: fixedNow });
    const flow = await agent.generate('hi');
    expect(flow.name).toBe('Echo');
    expect(provider.callCount).toBe(3);
  });
});

describe('FlowAgent.generate — transport errors (AC5)', () => {
  it('AC5 — throws 502 LLM_UNAVAILABLE when the provider rejects', async () => {
    const provider = new MockLLMProvider([new Error('socket hang up')]);
    const agent = new FlowAgent({ provider, now: fixedNow });
    await expect(agent.generate('hi')).rejects.toMatchObject({
      code: 'LLM_UNAVAILABLE',
      statusCode: 502,
    });
    expect(provider.callCount).toBe(1);
  });

  it('AC5 — does NOT retry on transport error even when a valid response is queued next', async () => {
    const provider = new MockLLMProvider([new Error('socket hang up'), buildDraftJson()]);
    const agent = new FlowAgent({ provider, now: fixedNow });
    await expect(agent.generate('hi')).rejects.toMatchObject({
      code: 'LLM_UNAVAILABLE',
    });
    expect(provider.callCount).toBe(1);
  });
});

describe('FlowAgent.generate — input validation (AC2)', () => {
  it('AC2 — rejects an empty prompt with 400 before calling the LLM', async () => {
    const provider = new MockLLMProvider([buildDraftJson()]);
    const agent = new FlowAgent({ provider, now: fixedNow });
    await expect(agent.generate('')).rejects.toMatchObject({
      code: 'INVALID_INPUT',
      statusCode: 400,
    });
    expect(provider.callCount).toBe(0);
  });

  it('AC2 — rejects a whitespace-only prompt', async () => {
    const provider = new MockLLMProvider([buildDraftJson()]);
    const agent = new FlowAgent({ provider, now: fixedNow });
    await expect(agent.generate('   \n\t  ')).rejects.toMatchObject({
      code: 'INVALID_INPUT',
    });
    expect(provider.callCount).toBe(0);
  });
});
