import type { Flow } from 'shared';

import { AppError } from '../errors.js';
import type { LLMMessage, LLMProvider } from '../llm/types.js';
import {
  REVIEW_AGENT_EXPLAIN_SYSTEM_PROMPT,
  buildExplainUserMessage,
} from './reviewAgent.prompt.js';

const ISSUE_DETAIL_MAX = 200;
const EXPLANATION_MIN_CHARS = 20;
/** Bracket prefixes we use to detect "LLM accidentally returned JSON" failures. */
const JSON_PREFIX_CHARS = new Set(['{', '[']);

/**
 * Minimal contract a review agent must satisfy. Routes depend on this
 * abstraction so tests can pass deterministic stubs without an LLM.
 *
 * Phase 4 will extend this with `review(flow): Promise<Issue[]>`.
 */
export interface FlowReviewer {
  explain(flow: Flow): Promise<string>;
}

export interface ReviewAgentOptions {
  provider: LLMProvider;
  /** Number of retries when the LLM output fails the validation gate. Default 1. */
  maxRetry?: number;
}

export class ReviewAgent implements FlowReviewer {
  private readonly provider: LLMProvider;
  private readonly maxRetry: number;

  constructor(opts: ReviewAgentOptions) {
    this.provider = opts.provider;
    this.maxRetry = opts.maxRetry ?? 1;
  }

  async explain(flow: Flow): Promise<string> {
    const messages: LLMMessage[] = [
      { role: 'system', content: REVIEW_AGENT_EXPLAIN_SYSTEM_PROMPT },
      { role: 'user', content: buildExplainUserMessage(flow) },
    ];

    const totalAttempts = this.maxRetry + 1;
    let lastIssue: string | undefined;

    for (let attempt = 1; attempt <= totalAttempts; attempt += 1) {
      let raw: string;
      try {
        raw = await this.provider.complete({ messages });
      } catch (err) {
        // Transport failure counts as an attempt; retry remains bounded by maxRetry.
        lastIssue = `transport: ${err instanceof Error ? err.message : String(err)}`;
        continue;
      }

      const validation = validateExplanation(raw);
      if (validation.ok) {
        return validation.value;
      }
      lastIssue = validation.issue;
    }

    const tail = lastIssue ? `: ${lastIssue.slice(0, ISSUE_DETAIL_MAX)}` : '';
    throw new AppError(
      'LLM_UNAVAILABLE',
      `LLM provider could not produce a usable explanation after ${totalAttempts} attempt(s)${tail}`,
      502,
    );
  }
}

interface ValidationOk {
  ok: true;
  value: string;
}
interface ValidationFail {
  ok: false;
  issue: string;
}

/**
 * Trims fences/whitespace and rejects responses that are too short or that
 * look like a raw JSON dump (LLM ignoring the markdown instruction). See
 * BUILD_PLAN.md §5.8 BA decision #3.
 */
function validateExplanation(raw: string): ValidationOk | ValidationFail {
  const trimmed = stripFences(raw).trim();
  if (trimmed.length < EXPLANATION_MIN_CHARS) {
    return {
      ok: false,
      issue: `explanation too short (${trimmed.length} chars, need ≥ ${EXPLANATION_MIN_CHARS})`,
    };
  }
  if (JSON_PREFIX_CHARS.has(trimmed[0]!)) {
    return {
      ok: false,
      issue: `explanation begins with a JSON bracket "${trimmed[0]}" — LLM likely returned a JSON dump instead of prose`,
    };
  }
  return { ok: true, value: trimmed };
}

function stripFences(raw: string): string {
  const trimmed = raw.trim();
  const fenceMatch = trimmed.match(/^```(?:markdown|md)?\s*([\s\S]*?)\s*```$/);
  return fenceMatch ? fenceMatch[1]!.trim() : trimmed;
}
