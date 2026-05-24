import type { Flow, Issue } from 'shared';

import { detectDanglingEdges } from './rules/danglingEdge.js';
import { detectDuplicateConditions } from './rules/duplicateCondition.js';
import { detectMissingEntry } from './rules/missingEntry.js';
import { detectMissingFallback } from './rules/missingFallback.js';
import { detectUnreachableNodes } from './rules/unreachableNode.js';
import { detectUnreachableReplies } from './rules/unreachableReply.js';

/**
 * Deterministic structural validation of a flow.
 *
 * Pure synchronous function: no IO, no LLM, no randomness. Each rule is
 * implemented as a small isolated function so individual signals are easy to
 * audit and test. The aggregator is the single entry point for callers.
 *
 * Returned issues are ordered by rule (entry → dangling → reachable →
 * fallback → duplicates → unreachable replies) which keeps the output stable
 * across runs.
 */
export function validateFlow(flow: Flow): Issue[] {
  return [
    ...detectMissingEntry(flow),
    ...detectDanglingEdges(flow),
    ...detectUnreachableNodes(flow),
    ...detectMissingFallback(flow),
    ...detectDuplicateConditions(flow),
    ...detectUnreachableReplies(flow),
  ];
}
