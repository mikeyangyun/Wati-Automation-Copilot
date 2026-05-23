// @vitest-environment happy-dom
import '@testing-library/jest-dom/vitest';

import type { Flow } from 'shared';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import type { AppStatus } from '../state.js';
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

describe('FlowPanel', () => {
  it('shows a placeholder hint when idle', () => {
    const status: AppStatus = { kind: 'idle' };
    render(<FlowPanel status={status} />);
    expect(screen.getByText(/no flow yet/i)).toBeInTheDocument();
    expect(screen.queryByTestId('flow-json')).not.toBeInTheDocument();
  });

  it('shows a progress hint while generating', () => {
    const status: AppStatus = { kind: 'generating' };
    render(<FlowPanel status={status} />);
    expect(screen.getByText(/generating flow/i)).toBeInTheDocument();
  });

  it('renders the flow JSON when status is ready', () => {
    const flow = buildFlow();
    const status: AppStatus = { kind: 'ready', flow };
    render(<FlowPanel status={status} />);
    const pre = screen.getByTestId('flow-json');
    expect(pre).toBeInTheDocument();
    // Parsed JSON should round-trip to the original flow.
    expect(JSON.parse(pre.textContent ?? '')).toEqual(flow);
  });

  it('renders an alert with code and message when status is error', () => {
    const status: AppStatus = {
      kind: 'error',
      error: { code: 'LLM_UNAVAILABLE', message: 'timeout', status: 502 },
    };
    render(<FlowPanel status={status} />);
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('LLM_UNAVAILABLE');
    expect(alert).toHaveTextContent('timeout');
  });
});
