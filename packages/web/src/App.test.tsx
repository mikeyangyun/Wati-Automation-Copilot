// @vitest-environment happy-dom
import '@testing-library/jest-dom/vitest';

import type { Flow, Session } from 'shared';
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
  startSession: vi.fn(),
  stepSession: vi.fn(),
  resetSession: vi.fn(),
  explainFlow: vi.fn(),
  reviewFlow: vi.fn(),
}));

import { App } from './App.js';
import {
  ApiError,
  explainFlow,
  generateFlow,
  resetSession,
  reviewFlow,
  startSession,
  stepSession,
  type ReviewResult,
  type SessionEnvelope,
} from './api.js';

const mockGenerate = generateFlow as unknown as ReturnType<typeof vi.fn>;
const mockStart = startSession as unknown as ReturnType<typeof vi.fn>;
const mockStep = stepSession as unknown as ReturnType<typeof vi.fn>;
const mockReset = resetSession as unknown as ReturnType<typeof vi.fn>;
const mockExplain = explainFlow as unknown as ReturnType<typeof vi.fn>;
const mockReview = reviewFlow as unknown as ReturnType<typeof vi.fn>;

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

const buildSession = (overrides: Partial<Session> = {}): Session => ({
  id: 'sess_1',
  flowId: 'flow_demo',
  currentNodeId: 'n1',
  status: 'waiting_for_input',
  transcript: [
    { role: 'bot', content: 'Buyer or seller?', nodeId: 'n1', timestamp: '2026-05-23T10:00:00Z' },
  ],
  context: { retryCount: 0 },
  ...overrides,
});

const buildEnvelope = (overrides: Partial<SessionEnvelope> = {}): SessionEnvelope => ({
  session: buildSession(),
  botMessages: ['Buyer or seller?'],
  events: [],
  ...overrides,
});

beforeEach(() => {
  mockGenerate.mockReset();
  mockStart.mockReset();
  mockStep.mockReset();
  mockReset.mockReset();
  mockExplain.mockReset();
  mockReview.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('App — flow generation', () => {
  it('starts in idle state and shows the empty hint', () => {
    render(<App />);
    expect(screen.getByText(/no flow yet/i)).toBeInTheDocument();
  });

  it('shows the generated flow JSON after a successful Generate click', async () => {
    mockGenerate.mockResolvedValueOnce(buildFlow());
    mockStart.mockResolvedValueOnce(buildEnvelope());
    const user = userEvent.setup();
    render(<App />);

    const textarea = screen.getByLabelText(/prompt input/i);
    await user.type(textarea, 'Greet new contacts.');
    await user.click(screen.getByRole('button', { name: /generate/i }));

    await waitFor(() => expect(screen.getByTestId('flow-json')).toBeInTheDocument());
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
    mockStart.mockResolvedValueOnce(buildEnvelope());
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

  it('aborts the in-flight generate request when the component unmounts', async () => {
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

describe('App — simulation auto-start + step + reset', () => {
  async function generate(user: ReturnType<typeof userEvent.setup>) {
    await user.type(screen.getByLabelText(/prompt input/i), 'hi');
    await user.click(screen.getByRole('button', { name: /generate/i }));
  }

  it('auto-starts a session on ready and shows the first bot message', async () => {
    mockGenerate.mockResolvedValueOnce(buildFlow());
    mockStart.mockResolvedValueOnce(buildEnvelope());
    const user = userEvent.setup();
    render(<App />);

    await generate(user);

    const transcript = await screen.findByTestId('chat-transcript');
    expect(transcript).toHaveTextContent('Buyer or seller?');
    expect(mockStart).toHaveBeenCalledWith('flow_demo', expect.any(AbortSignal));
  });

  it('appends user + bot turns when a reply is sent', async () => {
    mockGenerate.mockResolvedValueOnce(buildFlow());
    mockStart.mockResolvedValueOnce(buildEnvelope());
    const handedOff = buildEnvelope({
      session: buildSession({
        status: 'handed_off',
        currentNodeId: 'n_buy',
        transcript: [
          { role: 'bot', content: 'Buyer or seller?', nodeId: 'n1', timestamp: 't1' },
          { role: 'user', content: 'buyer', timestamp: 't2' },
          {
            role: 'bot',
            content: 'Transferring you to the Sales team…',
            nodeId: 'n_buy',
            timestamp: 't3',
          },
        ],
      }),
      botMessages: ['Transferring you to the Sales team…'],
      events: [
        { type: 'branch', from: 'n1', to: 'n_buy', condition: 'buyer' },
        { type: 'handoff', nodeId: 'n_buy', team: 'Sales' },
      ],
    });
    mockStep.mockResolvedValueOnce(handedOff);
    const user = userEvent.setup();
    render(<App />);
    await generate(user);

    await screen.findByTestId('chat-transcript');
    const input = screen.getByLabelText(/reply input/i);
    await user.type(input, 'buyer');
    await user.click(screen.getByRole('button', { name: 'Send' }));

    await waitFor(() =>
      expect(screen.getByTestId('chat-transcript')).toHaveTextContent('Transferring'),
    );
    expect(mockStep).toHaveBeenCalledWith('sess_1', 'buyer', expect.any(AbortSignal));
    // input cleared after send
    expect((screen.getByLabelText(/reply input/i) as HTMLInputElement).value).toBe('');
  });

  it('shows a terminal banner and disables the input when the session ends', async () => {
    mockGenerate.mockResolvedValueOnce(buildFlow());
    mockStart.mockResolvedValueOnce(
      buildEnvelope({
        session: buildSession({ status: 'completed', currentNodeId: 'n_end' }),
      }),
    );
    const user = userEvent.setup();
    render(<App />);
    await generate(user);

    await screen.findByText(/conversation completed/i);
    expect(screen.getByLabelText(/reply input/i)).toBeDisabled();
  });

  it('clears the transcript back to the entry message when Reset is clicked', async () => {
    mockGenerate.mockResolvedValueOnce(buildFlow());
    mockStart.mockResolvedValueOnce(
      buildEnvelope({
        session: buildSession({
          status: 'handed_off',
          transcript: [
            { role: 'bot', content: 'Buyer or seller?', nodeId: 'n1', timestamp: 't1' },
            { role: 'user', content: 'buyer', timestamp: 't2' },
            { role: 'bot', content: 'Sales handoff.', nodeId: 'n_buy', timestamp: 't3' },
          ],
        }),
      }),
    );
    mockReset.mockResolvedValueOnce(buildEnvelope());
    const user = userEvent.setup();
    render(<App />);
    await generate(user);

    await screen.findByText(/handed off/i);
    await user.click(screen.getByRole('button', { name: /reset/i }));

    await waitFor(() => {
      const transcript = screen.getByTestId('chat-transcript');
      expect(transcript).toHaveTextContent('Buyer or seller?');
      expect(transcript).not.toHaveTextContent('buyer');
      expect(transcript).not.toHaveTextContent('Sales handoff');
    });
    expect(mockReset).toHaveBeenCalledWith('sess_1', expect.any(AbortSignal));
  });

  it('renders an alert in the chat panel when a step fails', async () => {
    mockGenerate.mockResolvedValueOnce(buildFlow());
    mockStart.mockResolvedValueOnce(buildEnvelope());
    mockStep.mockRejectedValueOnce(new ApiError('SESSION_NOT_FOUND', 'gone', 404));
    const user = userEvent.setup();
    render(<App />);
    await generate(user);

    await screen.findByTestId('chat-transcript');
    await user.type(screen.getByLabelText(/reply input/i), 'hi');
    await user.click(screen.getByRole('button', { name: 'Send' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('SESSION_NOT_FOUND');
  });

  it('shows "Starting simulation…" while startSession is in flight', async () => {
    mockGenerate.mockResolvedValueOnce(buildFlow());
    mockStart.mockImplementationOnce(
      () =>
        new Promise<SessionEnvelope>(() => {
          /* never resolves */
        }),
    );
    const user = userEvent.setup();
    render(<App />);
    await generate(user);

    await screen.findByText(/starting simulation/i);
  });
});

describe('App — Explain wiring', () => {
  async function generate(user: ReturnType<typeof userEvent.setup>) {
    await user.type(screen.getByLabelText(/prompt input/i), 'hi');
    await user.click(screen.getByRole('button', { name: /generate/i }));
  }

  it('clicking Explain calls explainFlow with the ready flow id and renders the result', async () => {
    mockGenerate.mockResolvedValueOnce(buildFlow({ id: 'flow_demo' }));
    mockStart.mockResolvedValueOnce(buildEnvelope());
    mockExplain.mockResolvedValueOnce('- The bot greets contacts.\n- Then it ends.');
    const user = userEvent.setup();
    render(<App />);
    await generate(user);

    await screen.findByTestId('flow-json');
    await user.click(screen.getByRole('button', { name: 'Explain' }));

    const block = await screen.findByTestId('explanation');
    expect(block).toHaveTextContent('greets contacts');
    expect(mockExplain).toHaveBeenCalledWith('flow_demo', expect.any(AbortSignal));
  });

  it('renders the explanation error envelope when the API rejects', async () => {
    mockGenerate.mockResolvedValueOnce(buildFlow());
    mockStart.mockResolvedValueOnce(buildEnvelope());
    mockExplain.mockRejectedValueOnce(new ApiError('LLM_UNAVAILABLE', 'down', 502));
    const user = userEvent.setup();
    render(<App />);
    await generate(user);

    await screen.findByTestId('flow-json');
    await user.click(screen.getByRole('button', { name: 'Explain' }));

    const alert = await screen.findByTestId('explanation-error');
    expect(alert).toHaveTextContent('LLM_UNAVAILABLE');
    expect(alert).toHaveTextContent('down');
  });

  it('clicking Refresh aborts the prior in-flight explain and uses the latest result', async () => {
    mockGenerate.mockResolvedValueOnce(buildFlow());
    mockStart.mockResolvedValueOnce(buildEnvelope());
    // First call resolves immediately so we land in ready state quickly.
    mockExplain.mockResolvedValueOnce('- initial result');
    // Second call hangs so we can observe the prior controller is aborted.
    let secondSignal: AbortSignal | undefined;
    mockExplain.mockImplementationOnce(async (_id: string, signal?: AbortSignal) => {
      secondSignal = signal;
      await new Promise(() => {
        /* never resolves */
      });
      return 'unreachable';
    });
    const user = userEvent.setup();
    render(<App />);
    await generate(user);

    await screen.findByTestId('flow-json');
    await user.click(screen.getByRole('button', { name: 'Explain' }));
    await screen.findByTestId('explanation');

    // Click refresh — previous explanation should remain visible (dimmed),
    // and the third request should be in flight.
    await user.click(screen.getByRole('button', { name: /refresh explanation/i }));

    await screen.findByText(/initial result/i); // still visible
    expect(screen.getByTestId('explanation')).toHaveClass('flow-explanation-refreshing');
    expect(secondSignal?.aborted).toBe(false); // the second (hanging) call holds the signal
  });

  it('clicking × closes the explanation block and returns to idle', async () => {
    mockGenerate.mockResolvedValueOnce(buildFlow());
    mockStart.mockResolvedValueOnce(buildEnvelope());
    mockExplain.mockResolvedValueOnce('- something to close');
    const user = userEvent.setup();
    render(<App />);
    await generate(user);

    await screen.findByTestId('flow-json');
    await user.click(screen.getByRole('button', { name: 'Explain' }));
    await screen.findByTestId('explanation');

    await user.click(screen.getByRole('button', { name: /close explanation/i }));
    expect(screen.queryByTestId('explanation')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Explain' })).toBeEnabled();
  });

  it('resets explainStatus to idle when a new generate is triggered', async () => {
    // First flow → Explain succeeds.
    mockGenerate.mockResolvedValueOnce(buildFlow({ id: 'flow_one' }));
    mockStart.mockResolvedValueOnce(buildEnvelope());
    mockExplain.mockResolvedValueOnce('- first explanation');
    const user = userEvent.setup();
    render(<App />);
    await generate(user);
    await screen.findByTestId('flow-json');
    await user.click(screen.getByRole('button', { name: 'Explain' }));
    await screen.findByTestId('explanation');

    // Second generate → explanation should disappear.
    mockGenerate.mockResolvedValueOnce(buildFlow({ id: 'flow_two' }));
    mockStart.mockResolvedValueOnce(buildEnvelope());
    await user.clear(screen.getByLabelText(/prompt input/i));
    await user.type(screen.getByLabelText(/prompt input/i), 'second');
    await user.click(screen.getByRole('button', { name: /generate/i }));

    await waitFor(() => expect(screen.queryByTestId('explanation')).not.toBeInTheDocument());
  });
});

const buildReviewResult = (overrides: Partial<ReviewResult> = {}): ReviewResult => ({
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

describe('App — Review wiring (Phase 4)', () => {
  async function generate(user: ReturnType<typeof userEvent.setup>) {
    await user.type(screen.getByLabelText(/prompt input/i), 'hi');
    await user.click(screen.getByRole('button', { name: /generate/i }));
  }

  it('clicking Review calls reviewFlow with the ready flow id and renders the IssueList', async () => {
    mockGenerate.mockResolvedValueOnce(buildFlow({ id: 'flow_review_demo' }));
    mockStart.mockResolvedValueOnce(buildEnvelope());
    mockReview.mockResolvedValueOnce(buildReviewResult());
    const user = userEvent.setup();
    render(<App />);
    await generate(user);

    await screen.findByTestId('flow-json');
    await user.click(screen.getByRole('button', { name: 'Review' }));

    await screen.findByTestId('issue-list');
    expect(screen.getByText('1 issue found (1 warning).')).toBeInTheDocument();
    expect(mockReview).toHaveBeenCalledWith('flow_review_demo', expect.any(AbortSignal));
  });

  it('renders the SEMANTIC_REVIEW_UNAVAILABLE info issue end-to-end when the server degrades gracefully', async () => {
    mockGenerate.mockResolvedValueOnce(buildFlow());
    mockStart.mockResolvedValueOnce(buildEnvelope());
    mockReview.mockResolvedValueOnce(
      buildReviewResult({
        issues: [
          {
            severity: 'info',
            code: 'SEMANTIC_REVIEW_UNAVAILABLE',
            message: 'Semantic review is temporarily unavailable.',
            nodeIds: [],
          },
        ],
        summary: '1 issue found (1 info).',
      }),
    );
    const user = userEvent.setup();
    render(<App />);
    await generate(user);

    await screen.findByTestId('flow-json');
    await user.click(screen.getByRole('button', { name: 'Review' }));

    await screen.findByTestId('issue-info');
    expect(screen.getByText('SEMANTIC_REVIEW_UNAVAILABLE')).toBeInTheDocument();
  });

  it('renders the review error envelope when the API rejects with a transport-level error', async () => {
    mockGenerate.mockResolvedValueOnce(buildFlow());
    mockStart.mockResolvedValueOnce(buildEnvelope());
    mockReview.mockRejectedValueOnce(new ApiError('FLOW_NOT_FOUND', 'gone', 404));
    const user = userEvent.setup();
    render(<App />);
    await generate(user);

    await screen.findByTestId('flow-json');
    await user.click(screen.getByRole('button', { name: 'Review' }));

    const alert = await screen.findByTestId('review-error');
    expect(alert).toHaveTextContent('FLOW_NOT_FOUND');
  });

  it('clicking Review while an Explanation is open closes the Explanation (mutex)', async () => {
    mockGenerate.mockResolvedValueOnce(buildFlow());
    mockStart.mockResolvedValueOnce(buildEnvelope());
    mockExplain.mockResolvedValueOnce('- a previous explanation');
    mockReview.mockResolvedValueOnce(buildReviewResult());
    const user = userEvent.setup();
    render(<App />);
    await generate(user);

    await screen.findByTestId('flow-json');
    await user.click(screen.getByRole('button', { name: 'Explain' }));
    await screen.findByTestId('explanation');

    await user.click(screen.getByRole('button', { name: 'Review' }));
    await screen.findByTestId('issue-list');
    expect(screen.queryByTestId('explanation')).not.toBeInTheDocument();
  });

  it('clicking Explain while a Review is open closes the Review (mutex)', async () => {
    mockGenerate.mockResolvedValueOnce(buildFlow());
    mockStart.mockResolvedValueOnce(buildEnvelope());
    mockReview.mockResolvedValueOnce(buildReviewResult());
    mockExplain.mockResolvedValueOnce('- explanation');
    const user = userEvent.setup();
    render(<App />);
    await generate(user);

    await screen.findByTestId('flow-json');
    await user.click(screen.getByRole('button', { name: 'Review' }));
    await screen.findByTestId('issue-list');

    await user.click(screen.getByRole('button', { name: 'Explain' }));
    await screen.findByTestId('explanation');
    expect(screen.queryByTestId('issue-list')).not.toBeInTheDocument();
    expect(screen.queryByTestId('review')).not.toBeInTheDocument();
  });

  it('clicking × closes the review block and returns to idle', async () => {
    mockGenerate.mockResolvedValueOnce(buildFlow());
    mockStart.mockResolvedValueOnce(buildEnvelope());
    mockReview.mockResolvedValueOnce(buildReviewResult());
    const user = userEvent.setup();
    render(<App />);
    await generate(user);

    await screen.findByTestId('flow-json');
    await user.click(screen.getByRole('button', { name: 'Review' }));
    await screen.findByTestId('issue-list');

    await user.click(screen.getByRole('button', { name: /close review/i }));
    expect(screen.queryByTestId('review')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Review' })).toBeEnabled();
  });

  it('clicking Review again clears the previous result (blank-then-loading UX, BA decision #6)', async () => {
    mockGenerate.mockResolvedValueOnce(buildFlow());
    mockStart.mockResolvedValueOnce(buildEnvelope());
    mockReview.mockResolvedValueOnce(buildReviewResult());
    const user = userEvent.setup();
    render(<App />);
    await generate(user);
    await screen.findByTestId('flow-json');
    await user.click(screen.getByRole('button', { name: 'Review' }));
    await screen.findByTestId('issue-list');

    // Second click — server hangs; we expect the prior list to disappear and
    // the loading placeholder to show.
    mockReview.mockImplementationOnce(
      () =>
        new Promise<ReviewResult>(() => {
          /* never resolves */
        }),
    );
    await user.click(screen.getByRole('button', { name: /refresh review/i }));
    await screen.findByTestId('review-loading');
    expect(screen.queryByTestId('issue-list')).not.toBeInTheDocument();
  });

  it('resets reviewStatus to idle when a new generate is triggered', async () => {
    mockGenerate.mockResolvedValueOnce(buildFlow({ id: 'flow_one' }));
    mockStart.mockResolvedValueOnce(buildEnvelope());
    mockReview.mockResolvedValueOnce(buildReviewResult());
    const user = userEvent.setup();
    render(<App />);
    await generate(user);
    await screen.findByTestId('flow-json');
    await user.click(screen.getByRole('button', { name: 'Review' }));
    await screen.findByTestId('issue-list');

    mockGenerate.mockResolvedValueOnce(buildFlow({ id: 'flow_two' }));
    mockStart.mockResolvedValueOnce(buildEnvelope());
    await user.clear(screen.getByLabelText(/prompt input/i));
    await user.type(screen.getByLabelText(/prompt input/i), 'second');
    await user.click(screen.getByRole('button', { name: /generate/i }));

    await waitFor(() => expect(screen.queryByTestId('issue-list')).not.toBeInTheDocument());
  });
});
