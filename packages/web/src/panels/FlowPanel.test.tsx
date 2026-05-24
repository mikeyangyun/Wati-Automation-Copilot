// @vitest-environment happy-dom
import '@testing-library/jest-dom/vitest';

import type { Flow } from 'shared';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type { ReviewResult } from '../api.js';
import type { AppStatus, ExplainStatus, ReviewStatus } from '../state.js';
import { FlowPanel } from './FlowPanel.js';

const buildFlow = (overrides: Partial<Flow> = {}): Flow => ({
  id: 'flow_demo',
  name: 'Demo',
  prompt: 'demo prompt',
  trigger: { type: 'new_message' },
  entryNodeId: 'n0',
  nodes: [{ id: 'n0', type: 'trigger', label: 'Start', config: {} }],
  edges: [],
  createdAt: '2026-05-23T10:00:00Z',
  ...overrides,
});

const idleExplain: ExplainStatus = { kind: 'idle' };
const idleReview: ReviewStatus = { kind: 'idle' };

interface RenderHandlers {
  onExplain?: () => void;
  onCloseExplain?: () => void;
  onReview?: () => void;
  onCloseReview?: () => void;
}

function renderPanel(
  status: AppStatus,
  explainStatus: ExplainStatus = idleExplain,
  handlers: RenderHandlers = {},
  reviewStatus: ReviewStatus = idleReview,
) {
  return render(
    <FlowPanel
      status={status}
      explainStatus={explainStatus}
      reviewStatus={reviewStatus}
      onExplain={handlers.onExplain ?? vi.fn()}
      onCloseExplain={handlers.onCloseExplain ?? vi.fn()}
      onReview={handlers.onReview ?? vi.fn()}
      onCloseReview={handlers.onCloseReview ?? vi.fn()}
    />,
  );
}

describe('FlowPanel — base rendering', () => {
  it('shows a placeholder hint when idle and no Explain button', () => {
    renderPanel({ kind: 'idle' });
    // The idle copy ("No flow yet") moved inside the example-preview
    // banner. The literal string is preserved so screen-reader users and
    // existing automation keep the same anchor.
    expect(screen.getByText(/no flow yet/i)).toBeInTheDocument();
    expect(screen.queryByTestId('flow-json')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /explain/i })).not.toBeInTheDocument();
  });

  it('renders the example preview wrapper + banner when idle', async () => {
    renderPanel({ kind: 'idle' });
    // Wrapper is present and identifiable for scoped queries.
    expect(screen.getByTestId('flow-preview')).toBeInTheDocument();
    // Banner shows the eyebrow and a forward-pointing caption.
    expect(screen.getByText(/example preview/i)).toBeInTheDocument();
    expect(screen.getByText(/enter a prompt and click generate/i)).toBeInTheDocument();
    // And the sample graph itself renders (after the Suspense fallback
    // resolves) — proves the user actually sees what a flow looks like.
    await screen.findByTestId('flow-graph');
  });

  it('shows a progress hint while generating', () => {
    renderPanel({ kind: 'generating' });
    expect(screen.getByText(/generating flow/i)).toBeInTheDocument();
  });

  it('renders the graph by default when status is ready and surfaces the Explain button', async () => {
    const flow = buildFlow();
    renderPanel({ kind: 'ready', flow });
    expect(await screen.findByTestId('flow-graph')).toBeInTheDocument();
    expect(screen.queryByTestId('flow-json')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Explain' })).toBeEnabled();
  });

  it('renders an alert with code and message when status is error', () => {
    renderPanel({
      kind: 'error',
      error: { code: 'LLM_UNAVAILABLE', message: 'timeout', status: 502 },
    });
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('LLM_UNAVAILABLE');
    expect(alert).toHaveTextContent('timeout');
  });
});

describe('FlowPanel — Explain interaction', () => {
  const flow = buildFlow();
  const readyStatus: AppStatus = { kind: 'ready', flow };

  it('invokes onExplain when the Explain button is clicked', async () => {
    const onExplain = vi.fn();
    const user = userEvent.setup();
    renderPanel(readyStatus, idleExplain, { onExplain });

    await user.click(screen.getByRole('button', { name: 'Explain' }));
    expect(onExplain).toHaveBeenCalledTimes(1);
  });

  it('renders the loading placeholder and disables the button when explainStatus.kind === loading', () => {
    renderPanel(readyStatus, { kind: 'loading' });
    expect(screen.getByTestId('explanation-loading')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /explaining/i })).toBeDisabled();
  });

  it('renders the explanation as markdown bullets and switches the button label to Refresh', async () => {
    const explanation = `- When a contact messages, the bot asks buyer or seller.
- Buyers go to Sales.
- Sellers receive support.`;
    renderPanel(readyStatus, { kind: 'ready', explanation });

    const block = screen.getByTestId('explanation');
    expect(block).toBeInTheDocument();

    // react-markdown is lazy-loaded; wait for the bullet list to mount.
    await waitFor(() => {
      const items = block.querySelectorAll('li');
      expect(items).toHaveLength(3);
    });
    const items = block.querySelectorAll('li');
    expect(items[0]).toHaveTextContent('asks buyer or seller');
    expect(items[1]).toHaveTextContent('Buyers go to Sales');
    expect(items[2]).toHaveTextContent('Sellers receive support');

    expect(screen.getByRole('button', { name: /refresh explanation/i })).toBeEnabled();
  });

  it('renders the explanation block before the flow body in DOM order', async () => {
    const explanation = '- A short explanation';
    renderPanel(readyStatus, { kind: 'ready', explanation });

    const block = screen.getByTestId('explanation');
    const body = await screen.findByTestId('flow-graph');

    // DOCUMENT_POSITION_FOLLOWING means `body` follows `block` in document order.
    expect(block.compareDocumentPosition(body) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('disables the button and dims the block while refreshing (previous explanation still visible)', () => {
    renderPanel(readyStatus, {
      kind: 'ready',
      explanation: '- previous content',
      refreshing: true,
    });
    expect(screen.getByTestId('explanation')).toHaveTextContent('previous content');
    expect(screen.getByTestId('explanation')).toHaveClass('flow-explanation-refreshing');
    expect(screen.getByRole('button', { name: /explaining/i })).toBeDisabled();
  });

  it('renders an alert for explanation errors and re-enables the button', () => {
    renderPanel(readyStatus, {
      kind: 'error',
      error: { code: 'LLM_UNAVAILABLE', message: 'provider down', status: 502 },
    });
    const alert = screen.getByTestId('explanation-error');
    expect(alert).toHaveTextContent('LLM_UNAVAILABLE');
    expect(alert).toHaveTextContent('provider down');
    expect(screen.getByRole('button', { name: 'Explain' })).toBeEnabled();
  });

  it('invokes onCloseExplain when the × button is clicked', async () => {
    const onCloseExplain = vi.fn();
    const user = userEvent.setup();
    renderPanel(
      readyStatus,
      { kind: 'ready', explanation: '- something to close' },
      { onCloseExplain },
    );

    await user.click(screen.getByRole('button', { name: /close explanation/i }));
    expect(onCloseExplain).toHaveBeenCalledTimes(1);
  });
});

describe('FlowPanel — Review interaction', () => {
  const flow = buildFlow();
  const readyStatus: AppStatus = { kind: 'ready', flow };

  const buildResult = (overrides: Partial<ReviewResult> = {}): ReviewResult => ({
    issues: [
      {
        severity: 'warning',
        code: 'MISSING_FALLBACK',
        message: '"Ask buyer/seller" has no fallback edge.',
        nodeIds: ['n_ask'],
      },
    ],
    summary: '1 issue found (1 warning).',
    ...overrides,
  });

  it('does not render a Review button when no flow is ready', () => {
    renderPanel({ kind: 'idle' });
    expect(screen.queryByRole('button', { name: /review/i })).not.toBeInTheDocument();
  });

  it('renders a Review button next to Explain when status is ready', () => {
    renderPanel(readyStatus);
    expect(screen.getByRole('button', { name: 'Review' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Explain' })).toBeEnabled();
  });

  it('invokes onReview when the Review button is clicked', async () => {
    const onReview = vi.fn();
    const user = userEvent.setup();
    renderPanel(readyStatus, idleExplain, { onReview }, idleReview);
    await user.click(screen.getByRole('button', { name: 'Review' }));
    expect(onReview).toHaveBeenCalledTimes(1);
  });

  it('renders the loading placeholder and disables the Review button while loading', () => {
    renderPanel(readyStatus, idleExplain, {}, { kind: 'loading' });
    expect(screen.getByTestId('review-loading')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /reviewing/i })).toBeDisabled();
  });

  it('renders IssueList for a ready review and switches button label to Refresh', () => {
    renderPanel(readyStatus, idleExplain, {}, { kind: 'ready', result: buildResult() });
    expect(screen.getByTestId('issue-list')).toBeInTheDocument();
    expect(screen.getByText('1 issue found (1 warning).')).toBeInTheDocument();
    expect(screen.getByText('MISSING_FALLBACK')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /refresh review/i })).toBeEnabled();
  });

  it('renders the empty-state message when issues is empty', () => {
    const result = buildResult({ issues: [], summary: 'No issues found.' });
    renderPanel(readyStatus, idleExplain, {}, { kind: 'ready', result });
    expect(screen.getByTestId('issue-list-empty')).toBeInTheDocument();
    expect(screen.getByText('No issues found.')).toBeInTheDocument();
  });

  it('renders the error alert and surfaces a Refresh review button for retry', () => {
    renderPanel(
      readyStatus,
      idleExplain,
      {},
      {
        kind: 'error',
        error: { code: 'FLOW_NOT_FOUND', message: 'gone', status: 404 },
      },
    );
    const alert = screen.getByTestId('review-error');
    expect(alert).toHaveTextContent('FLOW_NOT_FOUND');
    expect(alert).toHaveTextContent('gone');
    // After an error, the primary action becomes "retry"; this also confirms
    // the button is not disabled (loading would have flipped it to "Reviewing…").
    expect(screen.getByRole('button', { name: /refresh review/i })).toBeEnabled();
  });

  it('invokes onCloseReview when the × button is clicked', async () => {
    const onCloseReview = vi.fn();
    const user = userEvent.setup();
    renderPanel(
      readyStatus,
      idleExplain,
      { onCloseReview },
      { kind: 'ready', result: buildResult() },
    );
    await user.click(screen.getByRole('button', { name: /close review/i }));
    expect(onCloseReview).toHaveBeenCalledTimes(1);
  });

  it('renders the review block above the flow body in DOM order', async () => {
    renderPanel(readyStatus, idleExplain, {}, { kind: 'ready', result: buildResult() });
    const block = screen.getByTestId('review');
    const body = await screen.findByTestId('flow-graph');
    expect(block.compareDocumentPosition(body) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});

describe('FlowPanel — Graph / JSON view toggle', () => {
  const flow = buildFlow();
  const readyStatus: AppStatus = { kind: 'ready', flow };

  it('defaults to the graph view when status becomes ready', async () => {
    renderPanel(readyStatus);
    expect(await screen.findByTestId('flow-graph')).toBeInTheDocument();
    expect(screen.queryByTestId('flow-json')).not.toBeInTheDocument();
  });

  it('exposes a "View JSON" toggle in the header that switches to the JSON view', async () => {
    renderPanel(readyStatus);
    await screen.findByTestId('flow-graph');
    const toggle = screen.getByTestId('flow-view-toggle');
    expect(toggle).toHaveTextContent('View JSON');

    const user = userEvent.setup();
    await user.click(toggle);
    expect(screen.getByTestId('flow-json')).toBeInTheDocument();
    expect(screen.queryByTestId('flow-graph')).not.toBeInTheDocument();
    expect(toggle).toHaveTextContent('View graph');
  });

  it('toggles back to the graph view on a second click', async () => {
    renderPanel(readyStatus);
    await screen.findByTestId('flow-graph');
    const user = userEvent.setup();
    const toggle = screen.getByTestId('flow-view-toggle');
    await user.click(toggle);
    await user.click(toggle);
    expect(await screen.findByTestId('flow-graph')).toBeInTheDocument();
    expect(toggle).toHaveTextContent('View JSON');
  });

  it('hides the toggle while the flow is not ready', () => {
    renderPanel({ kind: 'idle' });
    expect(screen.queryByTestId('flow-view-toggle')).not.toBeInTheDocument();
  });
});

describe('FlowPanel — Explain / Review mutex', () => {
  const flow = buildFlow();
  const readyStatus: AppStatus = { kind: 'ready', flow };

  it('renders only the explanation when both lifecycles are non-idle (defensive guard)', () => {
    renderPanel(
      readyStatus,
      { kind: 'ready', explanation: '- some explanation here' },
      {},
      {
        kind: 'ready',
        result: { issues: [], summary: 'No issues found.' },
      },
    );
    expect(screen.getByTestId('explanation')).toBeInTheDocument();
    expect(screen.queryByTestId('review')).not.toBeInTheDocument();
    expect(screen.queryByTestId('issue-list-empty')).not.toBeInTheDocument();
  });

  it('renders only the review when explainStatus is idle but reviewStatus is ready', () => {
    renderPanel(
      readyStatus,
      idleExplain,
      {},
      {
        kind: 'ready',
        result: { issues: [], summary: 'No issues found.' },
      },
    );
    expect(screen.queryByTestId('explanation')).not.toBeInTheDocument();
    expect(screen.getByTestId('review')).toBeInTheDocument();
  });
});
