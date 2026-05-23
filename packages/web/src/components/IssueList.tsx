import type { Issue, IssueCode, ReviewResult } from '../api.js';

const STRUCTURAL_CODES: ReadonlySet<IssueCode> = new Set<IssueCode>([
  'MISSING_ENTRY',
  'UNREACHABLE_NODE',
  'MISSING_FALLBACK',
  'DUPLICATE_CONDITION',
  'DANGLING_EDGE',
]);

const SEMANTIC_CODES: ReadonlySet<IssueCode> = new Set<IssueCode>([
  'MISSING_BRANCH',
  'AMBIGUOUS_ROUTING',
  'UNCLEAR_QUESTION',
]);

/**
 * Map an issue code to the source layer that produced it. Used purely for
 * display ("rule" / "llm" / "meta" badge); the server is the source of truth
 * for the issue itself.
 */
function issueSource(code: IssueCode): 'rule' | 'llm' | 'meta' {
  if (STRUCTURAL_CODES.has(code)) return 'rule';
  if (SEMANTIC_CODES.has(code)) return 'llm';
  return 'meta';
}

export interface IssueListProps {
  result: ReviewResult;
}

/**
 * Renders a hybrid-review report. Pure presentational component: it does not
 * fetch, refetch, or sort — the server ships an already-sorted list and a
 * pre-rendered summary string. Keeps client formatting drift out of the loop.
 */
export function IssueList({ result }: IssueListProps) {
  if (result.issues.length === 0) {
    return (
      <div className="issue-list issue-list-empty" data-testid="issue-list-empty">
        <p className="issue-summary">{result.summary}</p>
      </div>
    );
  }

  return (
    <div className="issue-list" data-testid="issue-list">
      <p className="issue-summary">{result.summary}</p>
      <ul className="issue-items">
        {result.issues.map((issue, idx) => (
          <li
            key={`${idx}-${issue.code}-${issue.nodeIds.join(',')}`}
            className={`issue issue-${issue.severity}`}
            data-testid={`issue-${issue.severity}`}
          >
            <IssueRow issue={issue} />
          </li>
        ))}
      </ul>
    </div>
  );
}

function IssueRow({ issue }: { issue: Issue }) {
  const source = issueSource(issue.code);
  return (
    <>
      <header className="issue-header">
        <span className={`issue-severity issue-severity-${issue.severity}`}>
          {issue.severity.toUpperCase()}
        </span>
        <code className="issue-code">{issue.code}</code>
        <span className={`issue-source issue-source-${source}`}>{source}</span>
      </header>
      <p className="issue-message">{issue.message}</p>
      {issue.nodeIds.length > 0 && (
        <p className="issue-nodes">
          <span className="issue-nodes-label">Affected:</span>
          {issue.nodeIds.map((id) => (
            <code key={id} className="issue-node-chip">
              {id}
            </code>
          ))}
        </p>
      )}
    </>
  );
}
