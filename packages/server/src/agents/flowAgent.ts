import { FlowSchema, newFlowId, type Flow } from 'shared';
import { z } from 'zod';

import { AppError } from '../errors.js';
import { describeProviderError } from '../llm/providerError.js';
import type { LLMMessage, LLMProvider } from '../llm/types.js';
import { FLOW_AGENT_SYSTEM_PROMPT, buildUserMessage } from './flowAgent.prompt.js';

const FlowDraftSchema = FlowSchema.omit({ id: true, prompt: true, createdAt: true });
type FlowDraft = z.infer<typeof FlowDraftSchema>;

const ISSUE_DETAIL_MAX = 200;

/**
 * Minimal contract a flow generator must satisfy. Routes depend on this
 * abstraction so tests can pass deterministic stubs without an LLM.
 */
export interface FlowGenerator {
  generate(prompt: string): Promise<Flow>;
}

export interface FlowAgentOptions {
  provider: LLMProvider;
  /** Number of retries when the LLM output fails JSON.parse or FlowSchema. Default 1. */
  maxRetry?: number;
  /** Injectable clock for deterministic createdAt in tests. */
  now?: () => string;
}

export class FlowAgent implements FlowGenerator {
  private readonly provider: LLMProvider;
  private readonly maxRetry: number;
  private readonly now: () => string;

  constructor(opts: FlowAgentOptions) {
    this.provider = opts.provider;
    this.maxRetry = opts.maxRetry ?? 1;
    this.now = opts.now ?? (() => new Date().toISOString());
  }

  async generate(prompt: string): Promise<Flow> {
    if (!prompt || !prompt.trim()) {
      throw new AppError('INVALID_INPUT', 'prompt must be a non-empty string', 400);
    }

    const messages: LLMMessage[] = [
      { role: 'system', content: FLOW_AGENT_SYSTEM_PROMPT },
      { role: 'user', content: buildUserMessage(prompt) },
    ];

    const totalAttempts = this.maxRetry + 1;
    let lastIssue: string | undefined;

    for (let attempt = 1; attempt <= totalAttempts; attempt += 1) {
      let raw: string;
      try {
        raw = await this.provider.complete({ messages });
      } catch (err) {
        // Transport / provider failure → no retry (per AC5).
        throw new AppError(
          'LLM_UNAVAILABLE',
          `LLM provider error: ${describeProviderError(err).slice(0, ISSUE_DETAIL_MAX)}`,
          502,
        );
      }

      const parseResult = tryParseDraft(raw);
      if (parseResult.ok) {
        const draft = parseResult.value;
        return this.composeFlow(draft, prompt);
      }

      lastIssue = parseResult.issue;
    }

    const tail = lastIssue ? `: ${lastIssue.slice(0, ISSUE_DETAIL_MAX)}` : '';
    throw new AppError(
      'LLM_OUTPUT_INVALID',
      `LLM output failed schema validation after ${totalAttempts} attempt(s)${tail}`,
      422,
    );
  }

  private composeFlow(draft: FlowDraft, prompt: string): Flow {
    const flow: Flow = {
      ...draft,
      id: newFlowId(),
      prompt,
      createdAt: this.now(),
    };

    // Belt-and-suspenders: the composed object should always satisfy FlowSchema
    // because draft already did. This guards against future drift.
    const verified = FlowSchema.safeParse(flow);
    if (!verified.success) {
      throw new AppError(
        'LLM_OUTPUT_INVALID',
        `Composed flow failed FlowSchema: ${verified.error.message.slice(0, ISSUE_DETAIL_MAX)}`,
        422,
      );
    }
    return verified.data;
  }
}

interface ParseOk {
  ok: true;
  value: FlowDraft;
}
interface ParseFail {
  ok: false;
  issue: string;
}

function tryParseDraft(raw: string): ParseOk | ParseFail {
  const stripped = stripFences(raw);

  let json: unknown;
  try {
    json = JSON.parse(stripped);
  } catch (err) {
    return {
      ok: false,
      issue: `JSON parse failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  const result = FlowDraftSchema.safeParse(json);
  if (!result.success) {
    return { ok: false, issue: result.error.message };
  }
  return { ok: true, value: result.data };
}

function stripFences(raw: string): string {
  const trimmed = raw.trim();
  const fenceMatch = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
  return fenceMatch ? fenceMatch[1]!.trim() : trimmed;
}
