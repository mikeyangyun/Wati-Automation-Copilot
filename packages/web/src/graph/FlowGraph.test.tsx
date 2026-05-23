// @vitest-environment happy-dom
import '@testing-library/jest-dom/vitest';

import { render, screen } from '@testing-library/react';
import type { Flow } from 'shared';
import { describe, expect, it } from 'vitest';

import { FlowGraph } from './FlowGraph.js';

// ResizeObserver / DOMMatrix / offset* shims live in `vitest.setup.ts`.

function tinyFlow(overrides: Partial<Flow> = {}): Flow {
  return {
    id: 'flow_g1',
    name: 'Tiny',
    prompt: 'tiny',
    trigger: { type: 'new_message' },
    entryNodeId: 'n0',
    nodes: [
      { id: 'n0', type: 'trigger', label: 'Start', config: {} },
      { id: 'n1', type: 'send_message', label: 'Hi there', config: { text: 'Hi' } },
    ],
    edges: [{ id: 'e0', from: 'n0', to: 'n1' }],
    createdAt: '2026-05-23T10:00:00Z',
    ...overrides,
  };
}

describe('FlowGraph — empty-flow fallback (AC-V8)', () => {
  it('renders a placeholder and does NOT mount React Flow when nodes are empty', () => {
    render(<FlowGraph flow={tinyFlow({ nodes: [], edges: [] })} />);
    expect(screen.getByTestId('flow-graph-empty')).toBeInTheDocument();
    expect(screen.queryByTestId('flow-graph')).not.toBeInTheDocument();
  });
});

describe('FlowGraph — rendering', () => {
  it('renders the React Flow surface when the flow has nodes', () => {
    render(<FlowGraph flow={tinyFlow()} />);
    expect(screen.getByTestId('flow-graph')).toBeInTheDocument();
  });

  it('renders one card per node with the correct label', () => {
    render(<FlowGraph flow={tinyFlow()} />);
    expect(screen.getByText('Start')).toBeInTheDocument();
    expect(screen.getByText('Hi there')).toBeInTheDocument();
  });

  it('flags selected nodes with data-selected and dims the rest', () => {
    render(<FlowGraph flow={tinyFlow()} selectedNodeIds={['n0']} selectedSeverity="warning" />);

    const selected = document.querySelector('[data-node-type="trigger"]') as HTMLElement;
    expect(selected).toHaveAttribute('data-selected', 'true');

    const dimmed = document.querySelector('[data-node-type="send_message"]') as HTMLElement;
    expect(dimmed.style.opacity).toBe('0.45');
  });

  it('does not dim any node when nothing is selected (default state)', () => {
    render(<FlowGraph flow={tinyFlow()} />);
    const sendMsg = document.querySelector('[data-node-type="send_message"]') as HTMLElement;
    // opacity should be 1 (default), serialised as either '' or '1'.
    expect(sendMsg.style.opacity === '' || sendMsg.style.opacity === '1').toBe(true);
  });
});
