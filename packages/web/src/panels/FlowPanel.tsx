import { Suspense, lazy, useState, type ReactNode } from 'react';
import type { Severity } from 'shared';

import { IssueList } from '../components/IssueList.js';
import type { AppStatus, ExplainStatus, ReviewStatus } from '../state.js';

/*
 * Lazy-loaded so they don't bloat the initial bundle. Neither is needed
 * before the user actually generates a flow:
 *   - `FlowGraph` pulls in `@xyflow/react` + `@dagrejs/dagre` (~150 KB gz).
 *   - `react-markdown` only renders when the Explain block is open.
 * Splitting them dropped the initial JS chunk from ~189 KB to ~85 KB gz.
 */
const FlowGraph = lazy(() =>
  import('../graph/FlowGraph.js').then((m) => ({ default: m.FlowGraph })),
);
const ReactMarkdown = lazy(() => import('react-markdown'));

type FlowView = 'graph' | 'json';

export interface FlowPanelProps {
  status: AppStatus;
  explainStatus: ExplainStatus;
  reviewStatus: ReviewStatus;
  onExplain: () => void;
  onCloseExplain: () => void;
  onReview: () => void;
  onCloseReview: () => void;
  /**
   * Node ids highlighted in the graph (typically the affected nodes of the
   * currently-selected review issue). Empty / undefined → no highlight.
   */
  selectedNodeIds?: string[];
  /** Severity of the currently selected issue — drives glow color. */
  selectedSeverity?: Severity;
  /** Index of the currently-selected issue card, or `null` when none. */
  selectedIssueIndex?: number | null;
  /** Fired when the user clicks an issue card. App owns the resulting state. */
  onSelectIssue?: (index: number | null) => void;
  /** Fires when the user clicks the "Test Chatbot" button in the header. */
  onOpenChatbot?: () => void;
  /**
   * Optional chat widget node. When provided (and the flow is ready), it's
   * rendered as a floating overlay anchored to the bottom-right of the flow
   * panel. App owns visibility — pass `null` to keep the widget closed.
   */
  chatWidget?: ReactNode;
}

export function FlowPanel({
  status,
  explainStatus,
  reviewStatus,
  onExplain,
  onCloseExplain,
  onReview,
  onCloseReview,
  selectedNodeIds,
  selectedSeverity,
  selectedIssueIndex,
  onSelectIssue,
  onOpenChatbot,
  chatWidget,
}: FlowPanelProps) {
  const flowReady = status.kind === 'ready';
  // The view toggle is presentation-only, so it lives in the panel rather
  // than bubbling all the way up to App. Graph is the default.
  const [view, setView] = useState<FlowView>('graph');

  const isExplainLoading = explainStatus.kind === 'loading';
  const isExplainRefreshing = explainStatus.kind === 'ready' && explainStatus.refreshing === true;
  const explainBusy = isExplainLoading || isExplainRefreshing;
  const hasExplanation = explainStatus.kind === 'ready';
  const explainLabel = explainBusy
    ? 'Explaining…'
    : hasExplanation
      ? 'Refresh explanation'
      : 'Explain';

  const reviewBusy = reviewStatus.kind === 'loading';
  const hasReview = reviewStatus.kind === 'ready' || reviewStatus.kind === 'error';
  const reviewLabel = reviewBusy ? 'Reviewing…' : hasReview ? 'Refresh review' : 'Review';

  // Mutex: the active block is whichever lifecycle is non-idle. App keeps
  // them mutually exclusive, so this is a presentation choice, not a guard.
  const showExplain = explainStatus.kind !== 'idle';
  const showReview = !showExplain && reviewStatus.kind !== 'idle';

  // The Test Chatbot button is gated on a ready flow — opening the widget
  // without a flow would start a session against `null`.
  const testChatbotDisabled = !flowReady;
  const testChatbotTitle = testChatbotDisabled
    ? 'Generate a flow first to launch the test chatbot'
    : 'Open the test chatbot — try the flow as if you were the end-user';

  return (
    <section className="panel flow-panel">
      <header className="flow-header">
        <h2>Flow</h2>
        {flowReady && (
          <div className="flow-header-actions">
            <button
              type="button"
              className="flow-explain-btn"
              onClick={onExplain}
              disabled={explainBusy}
            >
              {explainLabel}
            </button>
            <button
              type="button"
              className="flow-review-btn"
              onClick={onReview}
              disabled={reviewBusy}
            >
              {reviewLabel}
            </button>
            <button
              type="button"
              className="flow-view-btn"
              onClick={() => setView(view === 'graph' ? 'json' : 'graph')}
              data-testid="flow-view-toggle"
            >
              {view === 'graph' ? 'View JSON' : 'View graph'}
            </button>
            {onOpenChatbot !== undefined && (
              <button
                type="button"
                className="flow-test-chatbot-btn"
                onClick={onOpenChatbot}
                disabled={testChatbotDisabled}
                title={testChatbotTitle}
                data-testid="flow-test-chatbot"
              >
                <span className="flow-test-chatbot-icon" aria-hidden="true">
                  ▶
                </span>
                Test Chatbot
              </button>
            )}
          </div>
        )}
      </header>
      {showExplain && <ExplanationBlock status={explainStatus} onClose={onCloseExplain} />}
      {showReview && (
        <ReviewBlock
          status={reviewStatus}
          onClose={onCloseReview}
          selectedIssueIndex={selectedIssueIndex ?? null}
          onSelectIssue={onSelectIssue}
        />
      )}
      <FlowPanelBody
        status={status}
        view={view}
        selectedNodeIds={selectedNodeIds}
        selectedSeverity={selectedSeverity}
      />
      {chatWidget !== null && chatWidget !== undefined && (
        <div className="chat-widget" data-testid="chat-widget">
          {chatWidget}
        </div>
      )}
    </section>
  );
}

function ExplanationBlock({ status, onClose }: { status: ExplainStatus; onClose: () => void }) {
  if (status.kind === 'idle') return null;

  if (status.kind === 'loading') {
    return (
      <div className="flow-explanation flow-explanation-loading" data-testid="explanation-loading">
        Generating explanation…
      </div>
    );
  }

  if (status.kind === 'error') {
    return (
      <div className="flow-explanation-error" role="alert" data-testid="explanation-error">
        <strong>{status.error.code}</strong>
        <p>{status.error.message}</p>
      </div>
    );
  }

  // status.kind === 'ready'
  return (
    <div
      className={
        status.refreshing ? 'flow-explanation flow-explanation-refreshing' : 'flow-explanation'
      }
      data-testid="explanation"
    >
      <button
        type="button"
        className="flow-explanation-close"
        onClick={onClose}
        aria-label="Close explanation"
      >
        ×
      </button>
      <div className="flow-explanation-body">
        <Suspense fallback={<p>{status.explanation}</p>}>
          <ReactMarkdown>{status.explanation}</ReactMarkdown>
        </Suspense>
      </div>
    </div>
  );
}

interface ReviewBlockProps {
  status: ReviewStatus;
  onClose: () => void;
  selectedIssueIndex: number | null;
  onSelectIssue?: (index: number | null) => void;
}

function ReviewBlock({ status, onClose, selectedIssueIndex, onSelectIssue }: ReviewBlockProps) {
  if (status.kind === 'idle') return null;

  if (status.kind === 'loading') {
    return (
      <div className="flow-review flow-review-loading" data-testid="review-loading">
        Running review…
      </div>
    );
  }

  if (status.kind === 'error') {
    return (
      <div className="flow-review-error" role="alert" data-testid="review-error">
        <button
          type="button"
          className="flow-review-close"
          onClick={onClose}
          aria-label="Close review"
        >
          ×
        </button>
        <strong>{status.error.code}</strong>
        <p>{status.error.message}</p>
      </div>
    );
  }

  // status.kind === 'ready'
  return (
    <div className="flow-review" data-testid="review">
      <button
        type="button"
        className="flow-review-close"
        onClick={onClose}
        aria-label="Close review"
      >
        ×
      </button>
      <IssueList
        result={status.result}
        selectedIndex={selectedIssueIndex}
        {...(onSelectIssue ? { onSelect: onSelectIssue } : {})}
      />
    </div>
  );
}

interface FlowPanelBodyProps {
  status: AppStatus;
  view: FlowView;
  selectedNodeIds?: string[];
  selectedSeverity?: Severity;
}

function FlowPanelBody({ status, view, selectedNodeIds, selectedSeverity }: FlowPanelBodyProps) {
  switch (status.kind) {
    case 'idle':
      return <p className="placeholder">No flow yet. Enter a prompt and click Generate.</p>;
    case 'generating':
      return <p className="placeholder">Generating flow…</p>;
    case 'ready':
      if (view === 'graph') {
        return (
          <Suspense
            fallback={
              <div className="flow-graph flow-graph-empty" data-testid="flow-graph-loading">
                Loading graph…
              </div>
            }
          >
            <FlowGraph
              flow={status.flow}
              {...(selectedNodeIds !== undefined ? { selectedNodeIds } : {})}
              {...(selectedSeverity !== undefined ? { selectedSeverity } : {})}
            />
          </Suspense>
        );
      }
      return (
        <pre className="flow-json" data-testid="flow-json">
          {JSON.stringify(status.flow, null, 2)}
        </pre>
      );
    case 'error':
      return (
        <div className="flow-error" role="alert">
          <strong>{status.error.code}</strong>
          <p>{status.error.message}</p>
        </div>
      );
  }
}
