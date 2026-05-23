// @vitest-environment happy-dom
import '@testing-library/jest-dom/vitest';

import type { Flow } from 'shared';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type { AppStatus, ExplainStatus } from '../state.js';
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

function renderPanel(
  status: AppStatus,
  explainStatus: ExplainStatus = idleExplain,
  handlers: { onExplain?: () => void; onCloseExplain?: () => void } = {},
) {
  return render(
    <FlowPanel
      status={status}
      explainStatus={explainStatus}
      onExplain={handlers.onExplain ?? vi.fn()}
      onCloseExplain={handlers.onCloseExplain ?? vi.fn()}
    />,
  );
}

describe('FlowPanel — base rendering', () => {
  it('shows a placeholder hint when idle and no Explain button', () => {
    renderPanel({ kind: 'idle' });
    expect(screen.getByText(/no flow yet/i)).toBeInTheDocument();
    expect(screen.queryByTestId('flow-json')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /explain/i })).not.toBeInTheDocument();
  });

  it('shows a progress hint while generating', () => {
    renderPanel({ kind: 'generating' });
    expect(screen.getByText(/generating flow/i)).toBeInTheDocument();
  });

  it('renders the flow JSON when status is ready and surfaces the Explain button', () => {
    const flow = buildFlow();
    renderPanel({ kind: 'ready', flow });
    const pre = screen.getByTestId('flow-json');
    expect(pre).toBeInTheDocument();
    expect(JSON.parse(pre.textContent ?? '')).toEqual(flow);
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

  it('renders the explanation as markdown bullets and switches the button label to Refresh', () => {
    const explanation = `- When a contact messages, the bot asks buyer or seller.
- Buyers go to Sales.
- Sellers receive support.`;
    renderPanel(readyStatus, { kind: 'ready', explanation });

    const block = screen.getByTestId('explanation');
    expect(block).toBeInTheDocument();
    // react-markdown should emit a <ul> with 3 <li> items
    const items = block.querySelectorAll('li');
    expect(items).toHaveLength(3);
    expect(items[0]).toHaveTextContent('asks buyer or seller');
    expect(items[1]).toHaveTextContent('Buyers go to Sales');
    expect(items[2]).toHaveTextContent('Sellers receive support');

    expect(screen.getByRole('button', { name: /refresh explanation/i })).toBeEnabled();
  });

  it('renders the explanation block before the flow JSON in DOM order (AC-E7)', () => {
    const explanation = '- A short explanation';
    renderPanel(readyStatus, { kind: 'ready', explanation });

    const block = screen.getByTestId('explanation');
    const json = screen.getByTestId('flow-json');

    // DOCUMENT_POSITION_FOLLOWING means `json` follows `block` in document order.
    expect(block.compareDocumentPosition(json) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
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
