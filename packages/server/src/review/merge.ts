import type { Issue, Severity } from 'shared';

const SEVERITY_RANK: Record<Severity, number> = { error: 0, warning: 1, info: 2 };

export interface ReviewResult {
  issues: Issue[];
  summary: string;
}

/**
 * Combine structural (rule-based) and semantic (LLM) findings into one
 * report. Two important invariants:
 *
 * 1. **Structural authoritative on nodeId.** If a node appears in any
 *    structural issue's `nodeIds`, every semantic issue that mentions that
 *    same node is dropped. This avoids "the LLM and the validator both yelled
 *    at me about the same thing in two slightly different ways" noise and
 *    keeps the deterministic signal as the source of truth.
 *
 * 2. **Semantic issues without nodeIds are always kept.** They are
 *    intentionally flow-level (e.g. `MISSING_BRANCH` for an intent the model
 *    can only see in the prompt), and structural rules cannot cover them.
 *
 * Output ordering: severity descending (`error` → `warning` → `info`), then
 * structural before semantic, then preserves input order — stable across runs
 * for deterministic UI and test assertions.
 */
export function mergeIssues(structural: Issue[], semantic: Issue[]): ReviewResult {
  const structuralNodeIds = new Set<string>();
  for (const issue of structural) {
    for (const nodeId of issue.nodeIds) {
      structuralNodeIds.add(nodeId);
    }
  }

  const keptSemantic = semantic.filter((issue) => {
    if (issue.nodeIds.length === 0) return true;
    return !issue.nodeIds.some((id) => structuralNodeIds.has(id));
  });

  const combined: Issue[] = [...structural, ...keptSemantic];
  combined.sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]);

  return {
    issues: combined,
    summary: summarize(combined),
  };
}

/**
 * Generate the canonical summary string for an issue list. Pure formatting,
 * no LLM involvement, so the wording is stable and testable.
 *
 * Examples:
 *   []                        -> "No issues found."
 *   [error]                   -> "1 issue found (1 error)."
 *   [error, warning, info]    -> "3 issues found (1 error, 1 warning, 1 info)."
 */
export function summarize(issues: Issue[]): string {
  if (issues.length === 0) return 'No issues found.';

  let errors = 0;
  let warnings = 0;
  let infos = 0;
  for (const issue of issues) {
    if (issue.severity === 'error') errors += 1;
    else if (issue.severity === 'warning') warnings += 1;
    else infos += 1;
  }

  const parts: string[] = [];
  if (errors > 0) parts.push(`${errors} ${errors === 1 ? 'error' : 'errors'}`);
  if (warnings > 0) parts.push(`${warnings} ${warnings === 1 ? 'warning' : 'warnings'}`);
  if (infos > 0) parts.push(`${infos} info`);

  const noun = issues.length === 1 ? 'issue' : 'issues';
  return `${issues.length} ${noun} found (${parts.join(', ')}).`;
}
