import type { Flow, Issue } from 'shared';
import { SeverityEnum } from 'shared';
import { z } from 'zod';

import { AppError } from '../errors.js';
import type { LLMMessage, LLMProvider } from '../llm/types.js';
import {
  REVIEW_AGENT_EXPLAIN_SYSTEM_PROMPT,
  REVIEW_AGENT_REVIEW_SYSTEM_PROMPT,
  SEMANTIC_REVIEW_CODES,
  buildExplainUserMessage,
  buildReviewUserMessage,
} from './reviewAgent.prompt.js';

const ISSUE_DETAIL_MAX = 200;
const EXPLANATION_MIN_CHARS = 20;
/** Hard cap on findings the LLM can return; protects against runaway output. */
const MAX_SEMANTIC_ISSUES = 20;
/** Bracket prefixes we use to detect "LLM accidentally returned JSON" failures. */
const JSON_PREFIX_CHARS = new Set(['{', '[']);

/**
 * Schema used to validate the LLM review output. Restricts `code` to the
 * three semantic codes; if the model tries to return a structural code we
 * reject the response and retry, keeping the layer of responsibility clean.
 */
const SemanticIssueSchema = z.object({
  severity: SeverityEnum,
  code: z.enum(SEMANTIC_REVIEW_CODES),
  message: z.string().trim().min(1).max(400),
  nodeIds: z.array(z.string().min(1)).default([]),
});

const SemanticIssuesArraySchema = z.array(SemanticIssueSchema).max(MAX_SEMANTIC_ISSUES);

/**
 * Minimal contract a review agent must satisfy. Routes depend on this
 * abstraction so tests can pass deterministic stubs without an LLM.
 */
export interface FlowReviewer {
  explain(flow: Flow): Promise<string>;
  review(flow: Flow): Promise<Issue[]>;
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

  /**
   * Run a semantic review of the flow against its original prompt. Returns a
   * (possibly empty) list of `Issue`s restricted to semantic codes. Structural
   * concerns are intentionally left to the deterministic validator; the merge
   * step treats structural findings as authoritative.
   *
   * Throws `AppError('LLM_UNAVAILABLE', 502)` when all attempts fail. The
   * route layer is expected to translate that into an info-level
   * `SEMANTIC_REVIEW_UNAVAILABLE` issue rather than failing the request.
   */
  async review(flow: Flow): Promise<Issue[]> {
    const messages: LLMMessage[] = [
      { role: 'system', content: REVIEW_AGENT_REVIEW_SYSTEM_PROMPT },
      { role: 'user', content: buildReviewUserMessage(flow) },
    ];

    const totalAttempts = this.maxRetry + 1;
    let lastIssue: string | undefined;

    for (let attempt = 1; attempt <= totalAttempts; attempt += 1) {
      let raw: string;
      try {
        raw = await this.provider.complete({ messages });
      } catch (err) {
        lastIssue = `transport: ${err instanceof Error ? err.message : String(err)}`;
        continue;
      }

      const validation = validateReview(raw);
      if (validation.ok) {
        return validation.value;
      }
      lastIssue = validation.issue;
    }

    const tail = lastIssue ? `: ${lastIssue.slice(0, ISSUE_DETAIL_MAX)}` : '';
    throw new AppError(
      'LLM_UNAVAILABLE',
      `LLM provider could not produce a usable review after ${totalAttempts} attempt(s)${tail}`,
      502,
    );
  }
}

interface ValidationOk<T> {
  ok: true;
  value: T;
}
interface ValidationFail {
  ok: false;
  issue: string;
}

/**
 * Trims fences/whitespace and rejects responses that are too short or that
 * look like a raw JSON dump (LLM ignoring the markdown instruction).
 */
function validateExplanation(raw: string): ValidationOk<string> | ValidationFail {
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

/**
 * Strips ` ```json ... ``` ` or ` ``` ... ``` ` fences a chatty model might
 * wrap a JSON payload in despite the prompt asking otherwise. Kept separate
 * from `stripFences` so the explain and review paths can evolve independently.
 */
function stripJsonFences(raw: string): string {
  const trimmed = raw.trim();
  const fenceMatch = trimmed.match(/^```(?:json|JSON)?\s*([\s\S]*?)\s*```$/);
  return fenceMatch ? fenceMatch[1]!.trim() : trimmed;
}

/**
 * Trims fences, parses JSON, and validates with the semantic issue schema.
 * Rejection reasons (empty / parse error / schema mismatch) are surfaced so
 * the agent's retry loop can attach them to the eventual 502 if everything
 * fails.
 */
function validateReview(raw: string): ValidationOk<Issue[]> | ValidationFail {
  const stripped = stripJsonFences(raw).trim();
  if (stripped.length === 0) {
    return { ok: false, issue: 'empty response' };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(stripped);
  } catch (err) {
    return {
      ok: false,
      issue: `JSON parse failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
  const result = SemanticIssuesArraySchema.safeParse(parsed);
  if (!result.success) {
    const firstIssue = result.error.errors[0];
    const path = firstIssue?.path.join('.') ?? '';
    return {
      ok: false,
      issue: `schema mismatch${path ? ` at "${path}"` : ''}: ${firstIssue?.message ?? 'unknown'}`,
    };
  }
  return { ok: true, value: result.data };
}
