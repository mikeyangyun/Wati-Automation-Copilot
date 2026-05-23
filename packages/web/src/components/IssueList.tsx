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
  /**
   * Index of the currently selected issue, if any. Drives the visual "active"
   * state and the upstream graph-highlight selection. Empty / `null` when
   * nothing is selected.
   */
  selectedIndex?: number | null;
  /**
   * Fired when the user clicks an issue. Passes either the new index, or
   * `null` if the click toggled the active card off. The parent decides what
   * to do with the selection (typically: store in App state and pass to
   * `FlowPanel.selectedNodeIds`).
   */
  onSelect?: (index: number | null) => void;
}

/**
 * Renders a hybrid-review report. Pure presentational component: it does not
 * fetch, refetch, or sort — the server ships an already-sorted list and a
 * pre-rendered summary string. Keeps client formatting drift out of the loop.
 *
 * When `onSelect` is supplied the cards become interactive: clicking selects
 * an issue, clicking the same card again deselects. The graph uses the
 * selection to highlight affected nodes (see `FlowGraph.selectedNodeIds`).
 */
export function IssueList({ result, selectedIndex = null, onSelect }: IssueListProps) {
  if (result.issues.length === 0) {
    return (
      <div className="issue-list issue-list-empty" data-testid="issue-list-empty">
        <p className="issue-summary">{result.summary}</p>
      </div>
    );
  }

  const interactive = typeof onSelect === 'function';

  return (
    <div className="issue-list" data-testid="issue-list">
      <p className="issue-summary">{result.summary}</p>
      <ul className="issue-items">
        {result.issues.map((issue, idx) => {
          const isSelected = idx === selectedIndex;
          const className = ['issue', `issue-${issue.severity}`, isSelected ? 'issue-selected' : '']
            .filter(Boolean)
            .join(' ');
          const li = (
            <li
              key={`${idx}-${issue.code}-${issue.nodeIds.join(',')}`}
              className={className}
              data-testid={`issue-${issue.severity}`}
              data-selected={isSelected || undefined}
            >
              <IssueRow issue={issue} />
            </li>
          );
          if (!interactive) return li;
          // Wrap the <li> contents in a real <button> so keyboard, focus, and
          // screen-reader semantics come for free. The <li> stays so the
          // existing severity test selectors still resolve.
          return (
            <li
              key={`${idx}-${issue.code}-${issue.nodeIds.join(',')}`}
              className={className}
              data-testid={`issue-${issue.severity}`}
              data-selected={isSelected || undefined}
            >
              <button
                type="button"
                className="issue-button"
                aria-pressed={isSelected}
                onClick={() => onSelect!(isSelected ? null : idx)}
              >
                <IssueRow issue={issue} />
              </button>
            </li>
          );
        })}
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
