import ReactMarkdown from 'react-markdown';

import type { AppStatus, ExplainStatus } from '../state.js';

export interface FlowPanelProps {
  status: AppStatus;
  explainStatus: ExplainStatus;
  onExplain: () => void;
  onCloseExplain: () => void;
}

export function FlowPanel({ status, explainStatus, onExplain, onCloseExplain }: FlowPanelProps) {
  const flowReady = status.kind === 'ready';
  const isLoading = explainStatus.kind === 'loading';
  const isRefreshing = explainStatus.kind === 'ready' && explainStatus.refreshing === true;
  const explainBusy = isLoading || isRefreshing;
  const hasExplanation = explainStatus.kind === 'ready';
  const buttonLabel = explainBusy
    ? 'Explaining…'
    : hasExplanation
      ? 'Refresh explanation'
      : 'Explain';

  return (
    <section className="panel">
      <header className="flow-header">
        <h2>Flow</h2>
        {flowReady && (
          <button
            type="button"
            className="flow-explain-btn"
            onClick={onExplain}
            disabled={explainBusy}
          >
            {buttonLabel}
          </button>
        )}
      </header>
      <ExplanationBlock status={explainStatus} onClose={onCloseExplain} />
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
