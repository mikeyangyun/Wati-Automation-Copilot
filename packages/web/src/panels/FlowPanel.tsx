import ReactMarkdown from 'react-markdown';

import { IssueList } from '../components/IssueList.js';
import type { AppStatus, ExplainStatus, ReviewStatus } from '../state.js';

export interface FlowPanelProps {
  status: AppStatus;
  explainStatus: ExplainStatus;
  reviewStatus: ReviewStatus;
  onExplain: () => void;
  onCloseExplain: () => void;
  onReview: () => void;
  onCloseReview: () => void;
}

export function FlowPanel({
  status,
  explainStatus,
  reviewStatus,
  onExplain,
  onCloseExplain,
  onReview,
  onCloseReview,
}: FlowPanelProps) {
  const flowReady = status.kind === 'ready';

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

  // BA decision #5 — mutex: the active block is whichever lifecycle is
  // non-idle. App keeps them mutually exclusive, so this is a presentation
  // choice, not a guard.
  const showExplain = explainStatus.kind !== 'idle';
  const showReview = !showExplain && reviewStatus.kind !== 'idle';

  return (
    <section className="panel">
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
          </div>
        )}
      </header>
      {showExplain && <ExplanationBlock status={explainStatus} onClose={onCloseExplain} />}
      {showReview && <ReviewBlock status={reviewStatus} onClose={onCloseReview} />}
      <FlowPanelBody status={status} />
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
        <ReactMarkdown>{status.explanation}</ReactMarkdown>
      </div>
    </div>
  );
}

function ReviewBlock({ status, onClose }: { status: ReviewStatus; onClose: () => void }) {
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
      <IssueList result={status.result} />
    </div>
  );
}

function FlowPanelBody({ status }: { status: AppStatus }) {
  switch (status.kind) {
    case 'idle':
      return <p className="placeholder">No flow yet. Enter a prompt and click Generate.</p>;
    case 'generating':
      return <p className="placeholder">Generating flow…</p>;
    case 'ready':
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
