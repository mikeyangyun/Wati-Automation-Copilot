import type { Flow, Issue } from 'shared';

/**
 * `UNREACHABLE_NODE` (warning)
 *
 * Fires for every node not reachable from `entryNodeId` via outgoing edges.
 * Skipped entirely when `entryNodeId` itself is missing — `MISSING_ENTRY`
 * already speaks to that case and reachability is undefined.
 *
 * Edges with dangling endpoints are ignored during traversal so this rule
 * does not double-report errors caught by `DANGLING_EDGE`.
 */
export function detectUnreachableNodes(flow: Flow): Issue[] {
  const nodeIds = new Set(flow.nodes.map((node) => node.id));
  if (!nodeIds.has(flow.entryNodeId)) return [];

  const adjacency = new Map<string, string[]>();
  for (const id of nodeIds) adjacency.set(id, []);
  for (const edge of flow.edges) {
    if (nodeIds.has(edge.from) && nodeIds.has(edge.to)) {
      adjacency.get(edge.from)!.push(edge.to);
    }
  }

  const reached = new Set<string>();
  const stack: string[] = [flow.entryNodeId];
  while (stack.length > 0) {
    const current = stack.pop()!;
    if (reached.has(current)) continue;
    reached.add(current);
    for (const next of adjacency.get(current) ?? []) {
      stack.push(next);
    }
  }

  const issues: Issue[] = [];
  for (const node of flow.nodes) {
    if (reached.has(node.id)) continue;
    issues.push({
      severity: 'warning',
      code: 'UNREACHABLE_NODE',
      message: `Node "${node.label}" is not reachable from the entry node.`,
      nodeIds: [node.id],
    });
  }
  return issues;
}
