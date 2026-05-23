import type { AppStatus } from '../state.js';

export interface FlowPanelProps {
  status: AppStatus;
}

export function FlowPanel({ status }: FlowPanelProps) {
  return (
    <section className="panel">
      <h2>Flow</h2>
      <FlowPanelBody status={status} />
    </section>
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
