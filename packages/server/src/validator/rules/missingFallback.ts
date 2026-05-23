import type { Edge, Flow, Issue } from 'shared';

/**
 * `MISSING_FALLBACK` (warning)
 *
 * Fires for `ask_question` / `condition` nodes whose outgoing edges all have
 * a `condition` label (i.e. there is no default / unmatched-reply edge).
 * Such nodes can dead-end when the user replies with anything unexpected.
 */
export function detectMissingFallback(flow: Flow): Issue[] {
  const issues: Issue[] = [];
  const nodeById = new Map(flow.nodes.map((node) => [node.id, node] as const));

  const bySource = new Map<string, Edge[]>();
  for (const edge of flow.edges) {
    const existing = bySource.get(edge.from);
    if (existing) {
      existing.push(edge);
    } else {
      bySource.set(edge.from, [edge]);
    }
  }

  for (const [sourceId, edges] of bySource) {
    const node = nodeById.get(sourceId);
    if (!node) continue;
    if (node.type !== 'ask_question' && node.type !== 'condition') continue;

    const hasLabeled = edges.some((e) => e.condition !== undefined);
    const hasDefault = edges.some((e) => e.condition === undefined);
    if (hasLabeled && !hasDefault) {
      issues.push({
        severity: 'warning',
        code: 'MISSING_FALLBACK',
        message: `"${node.label}" branches on user replies but has no fallback edge for unmatched answers.`,
        nodeIds: [node.id],
      });
    }
  }

  return issues;
}
