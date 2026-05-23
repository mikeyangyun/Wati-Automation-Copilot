import type { Edge } from 'shared';

/**
 * Result of matching a user reply against a set of outgoing edges.
 *
 * - `exact`     — the reply matched an edge whose `condition` equals the reply
 *                 (case-insensitive, trimmed). The `condition` is guaranteed
 *                 not to be the literal `'fallback'`.
 * - `fallback`  — no exact match, but an edge with `condition === 'fallback'`
 *                 was present and is returned.
 * - `none`      — neither an exact match nor a fallback edge exists.
 */
export type MatchResult =
  | { kind: 'exact'; edge: Edge }
  | { kind: 'fallback'; edge: Edge }
  | { kind: 'none' };

export const FALLBACK_LABEL = 'fallback';

/**
 * Strict, deterministic match rule:
 *   normalise(reply) === normalise(edge.condition)
 * where `normalise = trim().toLowerCase()`.
 *
 * Edges without a `condition` (unconditional advance edges) are ignored — they
 * are not branching choices. The first matching edge wins if multiple edges
 * share the same condition (which would be a flow-design bug, but the matcher
 * stays predictable).
 */
export function matchBranch(reply: string, edges: ReadonlyArray<Edge>): MatchResult {
  const normalized = normalise(reply);

  for (const edge of edges) {
    if (!edge.condition) continue;
    const label = normalise(edge.condition);
    if (label === FALLBACK_LABEL) continue;
    if (label === normalized) {
      return { kind: 'exact', edge };
    }
  }

  for (const edge of edges) {
    if (!edge.condition) continue;
    if (normalise(edge.condition) === FALLBACK_LABEL) {
      return { kind: 'fallback', edge };
    }
  }

  return { kind: 'none' };
}

function normalise(value: string): string {
  return value.trim().toLowerCase();
}
