import { FlowSchema } from 'shared';
import { describe, expect, it } from 'vitest';

import { SAMPLE_FLOW } from './sampleFlow.js';

describe('SAMPLE_FLOW', () => {
  it('parses cleanly with the shared FlowSchema', () => {
    // The constant is already parsed at module load, but re-asserting here
    // guards against the export accidentally being changed to bypass the
    // schema (e.g. cast to Flow without validation).
    expect(() => FlowSchema.parse(SAMPLE_FLOW)).not.toThrow();
  });

  it('uses each of the five most common node types so first-time users see the dominant cards', () => {
    const types = new Set(SAMPLE_FLOW.nodes.map((n) => n.type));
    for (const required of [
      'trigger',
      'ask_question',
      'condition',
      'assign_to_team',
      'send_message',
    ] as const) {
      expect(types.has(required)).toBe(true);
    }
  });

  it('entryNodeId references a real node', () => {
    const ids = new Set(SAMPLE_FLOW.nodes.map((n) => n.id));
    expect(ids.has(SAMPLE_FLOW.entryNodeId)).toBe(true);
  });

  it('every edge references existing nodes', () => {
    const ids = new Set(SAMPLE_FLOW.nodes.map((n) => n.id));
    for (const edge of SAMPLE_FLOW.edges) {
      expect(ids.has(edge.from)).toBe(true);
      expect(ids.has(edge.to)).toBe(true);
    }
  });

  it('the ask_question node carries expectedReplies so the NodeCard shows quick-reply chips', () => {
    // The whole point of the example is to surface what generated nodes
    // look like; the ask_question chips are the most informative card.
    const ask = SAMPLE_FLOW.nodes.find((n) => n.type === 'ask_question');
    expect(ask).toBeDefined();
    const replies = (ask!.config as { expectedReplies?: unknown }).expectedReplies;
    expect(Array.isArray(replies)).toBe(true);
    expect((replies as string[]).length).toBeGreaterThanOrEqual(2);
  });

  it('uses a stable, recognisable id (so it never collides with a generated flow id)', () => {
    // Real generated flows use the `flow_` prefix via `newId('flow')`.
    // Keeping a non-prefixed literal id makes the sample distinguishable
    // in logs and devtools.
    expect(SAMPLE_FLOW.id).not.toMatch(/^flow_/);
  });
});
