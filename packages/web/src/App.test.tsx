// @vitest-environment happy-dom
import '@testing-library/jest-dom/vitest';

import type { Flow } from 'shared';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./api.js', () => ({
  ApiError: class ApiError extends Error {
    public code: string;
    public status: number;
    constructor(code: string, message: string, status: number) {
      super(message);
      this.name = 'ApiError';
      this.code = code;
      this.status = status;
    }
  },
  generateFlow: vi.fn(),
  getFlow: vi.fn(),
}));

import { App } from './App.js';
import { ApiError, generateFlow } from './api.js';

const mockGenerate = generateFlow as unknown as ReturnType<typeof vi.fn>;

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

beforeEach(() => {
  mockGenerate.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('App — end-to-end flow generation', () => {
  it('starts in idle state and shows the empty hint', () => {
    render(<App />);
    expect(screen.getByText(/no flow yet/i)).toBeInTheDocument();
  });

  it('shows the generated flow JSON after a successful Generate click', async () => {
    const flow = buildFlow();
    mockGenerate.mockResolvedValueOnce(flow);
    const user = userEvent.setup();
    render(<App />);

    const textarea = screen.getByLabelText(/prompt input/i);
    await user.type(textarea, 'Greet new contacts.');
    await user.click(screen.getByRole('button', { name: /generate/i }));

    await waitFor(() => expect(screen.getByTestId('flow-json')).toBeInTheDocument());
    expect(JSON.parse(screen.getByTestId('flow-json').textContent ?? '')).toEqual(flow);
    expect(mockGenerate).toHaveBeenCalledWith('Greet new contacts.', expect.any(AbortSignal));
  });

  it('shows an inline progress hint while the request is in flight', async () => {
    let resolveFn: (flow: Flow) => void = () => {};
    mockGenerate.mockImplementationOnce(
      () =>
        new Promise<Flow>((resolve) => {
          resolveFn = resolve;
        }),
    );
    const user = userEvent.setup();
    render(<App />);

    await user.type(screen.getByLabelText(/prompt input/i), 'hi');
    await user.click(screen.getByRole('button', { name: /generate/i }));

    expect(screen.getByText(/generating flow/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /generating/i })).toBeDisabled();

    resolveFn(buildFlow());
    await waitFor(() => expect(screen.getByTestId('flow-json')).toBeInTheDocument());
  });

  it('renders the server error code and message when the API returns an ApiError', async () => {
    mockGenerate.mockRejectedValueOnce(new ApiError('LLM_UNAVAILABLE', 'provider timed out', 502));
    const user = userEvent.setup();
    render(<App />);

    await user.type(screen.getByLabelText(/prompt input/i), 'hi');
    await user.click(screen.getByRole('button', { name: /generate/i }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('LLM_UNAVAILABLE');
    expect(alert).toHaveTextContent('provider timed out');
  });

  it('renders a generic error when an unknown error is thrown', async () => {
    mockGenerate.mockRejectedValueOnce(new Error('boom'));
    const user = userEvent.setup();
    render(<App />);

    await user.type(screen.getByLabelText(/prompt input/i), 'hi');
    await user.click(screen.getByRole('button', { name: /generate/i }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('UNKNOWN');
  });

  it('aborts the in-flight request when the component unmounts', async () => {
    let observedSignal: AbortSignal | undefined;
    mockGenerate.mockImplementationOnce(async (_prompt: string, signal?: AbortSignal) => {
      observedSignal = signal;
      await new Promise((r) => setTimeout(r, 100));
      return buildFlow();
    });
    const user = userEvent.setup();
    const { unmount } = render(<App />);

    await user.type(screen.getByLabelText(/prompt input/i), 'hi');
    await user.click(screen.getByRole('button', { name: /generate/i }));

    unmount();
    await waitFor(() => expect(observedSignal?.aborted).toBe(true));
  });
});
