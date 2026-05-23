import type { Flow, Issue } from 'shared';

/**
 * Normalize a condition label for duplicate detection: case-insensitive and
 * whitespace-trimmed so `" Yes "` and `"yes"` count as the same branch.
 */
function normalize(condition: string): string {
  return condition.trim().toLowerCase();
}

/**
 * `DUPLICATE_CONDITION` (warning)
 *
 * Fires when two or more outgoing edges from the same source share the same
 * (normalized) condition label. Only the first match wins at runtime, so the
 * remaining edges are effectively dead.
 */
export function detectDuplicateConditions(flow: Flow): Issue[] {
  const issues: Issue[] = [];
  const nodeById = new Map(flow.nodes.map((node) => [node.id, node] as const));

  const bySource = new Map<string, Map<string, { count: number; raw: string }>>();
  for (const edge of flow.edges) {
    if (edge.condition === undefined) continue;
    const sourceGroups = bySource.get(edge.from) ?? new Map();
    const key = normalize(edge.condition);
    const existing = sourceGroups.get(key);
    if (existing) {
      existing.count += 1;
    } else {
      sourceGroups.set(key, { count: 1, raw: edge.condition });
    }
    bySource.set(edge.from, sourceGroups);
  }

  for (const [sourceId, groups] of bySource) {
    const node = nodeById.get(sourceId);
    const label = node?.label ?? sourceId;
    for (const [, entry] of groups) {
      if (entry.count < 2) continue;
      issues.push({
        severity: 'warning',
        code: 'DUPLICATE_CONDITION',
        message: `"${label}" has ${entry.count} outgoing edges with the same condition "${entry.raw}". Only the first match is taken.`,
        nodeIds: [sourceId],
      });
    }
  }

  return issues;
}
