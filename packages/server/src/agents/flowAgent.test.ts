import { FlowSchema } from 'shared';
import { describe, expect, it } from 'vitest';

import { MockLLMProvider } from '../llm/mock.js';
import { FlowAgent } from './flowAgent.js';
import { FLOW_AGENT_SYSTEM_PROMPT } from './flowAgent.prompt.js';

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

describe('FLOW_AGENT_SYSTEM_PROMPT — expectedReplies guardrails', () => {
  // Regression: the live LLM was producing `["1", "Billing", "2", "Technical
  // Support", ...]` because the prompt didn't forbid the number-as-alias
  // pattern. The chat panel rendered each entry as its own quick-reply chip,
  // creating duplicate-looking choices. These tests pin the wording so the
  // rule can't silently disappear during future prompt edits.

  it('forbids splitting one choice into separate numeric + textual entries', () => {
    expect(FLOW_AGENT_SYSTEM_PROMPT).toMatch(/ONE entry per distinct choice/i);
    expect(FLOW_AGENT_SYSTEM_PROMPT).toMatch(
      /Do NOT add a separate numeric alias for the same choice/i,
    );
  });

  it('explicitly disallows the "reply with the number or name" prefacing pattern', () => {
    expect(FLOW_AGENT_SYSTEM_PROMPT).toMatch(/reply with the number or name/i);
    expect(FLOW_AGENT_SYSTEM_PROMPT).toMatch(/quick-reply chips are rendered/i);
  });

  it('documents that edge condition labels must mirror expectedReplies (or fallback)', () => {
    expect(FLOW_AGENT_SYSTEM_PROMPT).toMatch(/match an expectedReplies entry exactly/i);
  });

  it('shows a concrete well-formed example to anchor the model', () => {
    // The example must use plain text labels with NO numeric aliases. If a
    // future edit slips in something like "1", "Billing" pairs, this test
    // will catch it.
    expect(FLOW_AGENT_SYSTEM_PROMPT).toMatch(/"expectedReplies":\s*\[/);
    expect(FLOW_AGENT_SYSTEM_PROMPT).toContain('"Billing"');
    // Negative assertion — the example must not contain a standalone numeric
    // entry like "1" or "2" inside an expectedReplies array.
    const exampleMatch = FLOW_AGENT_SYSTEM_PROMPT.match(/"expectedReplies":\s*\[([^\]]*)\]/);
    expect(exampleMatch).not.toBeNull();
    const exampleBody = exampleMatch![1] ?? '';
    expect(exampleBody).not.toMatch(/"\d+"/);
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
