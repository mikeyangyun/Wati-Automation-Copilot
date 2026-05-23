import type { Flow, Issue } from 'shared';

/**
 * `DANGLING_EDGE` (error)
 *
 * Fires when an edge references a node that does not exist in `flow.nodes`.
 * Includes any existing endpoint(s) in `nodeIds` so the UI can highlight the
 * real side of a broken connection.
 */
export function detectDanglingEdges(flow: Flow): Issue[] {
  const ids = new Set(flow.nodes.map((node) => node.id));
  const issues: Issue[] = [];

  for (const edge of flow.edges) {
    const fromMissing = !ids.has(edge.from);
    const toMissing = !ids.has(edge.to);
    if (!fromMissing && !toMissing) continue;

    const affected = [edge.from, edge.to].filter((id) => ids.has(id));
    let detail: string;
    if (fromMissing && toMissing) {
      detail = `both endpoints ("${edge.from}", "${edge.to}")`;
    } else if (fromMissing) {
      detail = `missing source "${edge.from}"`;
    } else {
      detail = `missing target "${edge.to}"`;
    }

    issues.push({
      severity: 'error',
      code: 'DANGLING_EDGE',
      message: `Edge "${edge.id}" references ${detail}.`,
      nodeIds: affected,
    });
  }

  return issues;
}
