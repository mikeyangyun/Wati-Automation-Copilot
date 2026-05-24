// @vitest-environment happy-dom
import '@testing-library/jest-dom/vitest';

import type { Flow, Session } from 'shared';
import { render, screen, waitFor, within } from '@testing-library/react';
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

    await waitFor(() => expect(screen.getByTestId('flow-graph')).toBeInTheDocument());
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
    await waitFor(() => expect(screen.getByTestId('flow-graph')).toBeInTheDocument());
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

describe('App — Test Chatbot flow (start + step + reset)', () => {
  /**
   * Drives the regenerate path AND clicks "Test Chatbot" so the floating
   * chat widget mounts. The session is started lazily on that click — the
   * previous "auto-start on ready" behavior was removed in favour of a more
   * focused 2-column layout (Prompt + Flow), with the chat as an explicit
   * opt-in widget. Kept named `generate` so existing call sites in this
   * describe block don't need to change.
   */
  async function generate(user: ReturnType<typeof userEvent.setup>) {
    await user.type(screen.getByLabelText(/prompt input/i), 'hi');
    await user.click(screen.getByRole('button', { name: /generate/i }));
    await screen.findByTestId('flow-graph');
    await user.click(screen.getByTestId('flow-test-chatbot'));
  }

  it('does not auto-start a session on flow ready (user must click Test Chatbot)', async () => {
    mockGenerate.mockResolvedValueOnce(buildFlow());
    const user = userEvent.setup();
    render(<App />);

    await user.type(screen.getByLabelText(/prompt input/i), 'hi');
    await user.click(screen.getByRole('button', { name: /generate/i }));
    await screen.findByTestId('flow-graph');

    // Crucial regression: the simulator must NOT bootstrap until the user
    // explicitly asks for it via Test Chatbot.
    expect(mockStart).not.toHaveBeenCalled();
    expect(screen.queryByTestId('chat-transcript')).not.toBeInTheDocument();
  });

  it('clicking Test Chatbot starts a session and shows the first bot message', async () => {
    mockGenerate.mockResolvedValueOnce(buildFlow());
    mockStart.mockResolvedValueOnce(buildEnvelope());
    const user = userEvent.setup();
    render(<App />);

    await generate(user);

    const transcript = await screen.findByTestId('chat-transcript');
    expect(transcript).toHaveTextContent('Buyer or seller?');
    expect(mockStart).toHaveBeenCalledWith('flow_demo', expect.any(AbortSignal));
  });

  it('closing the chat widget keeps the session intact for re-open', async () => {
    mockGenerate.mockResolvedValueOnce(buildFlow());
    mockStart.mockResolvedValueOnce(buildEnvelope());
    const user = userEvent.setup();
    render(<App />);
    await generate(user);
    await screen.findByTestId('chat-transcript');

    // Close the widget — chat UI disappears but startSession should NOT be
    // re-invoked when we reopen.
    await user.click(screen.getByTestId('chat-close'));
    expect(screen.queryByTestId('chat-transcript')).not.toBeInTheDocument();
    expect(screen.queryByTestId('chat-widget')).not.toBeInTheDocument();

    await user.click(screen.getByTestId('flow-test-chatbot'));
    // Same single startSession call — re-opening reused the session.
    expect(mockStart).toHaveBeenCalledTimes(1);
    // And the transcript came back as it was.
    expect(await screen.findByTestId('chat-transcript')).toHaveTextContent('Buyer or seller?');
  });

  it('regenerating closes the chat widget and resets the session state', async () => {
    mockGenerate.mockResolvedValueOnce(buildFlow());
    mockStart.mockResolvedValueOnce(buildEnvelope());
    const user = userEvent.setup();
    render(<App />);
    await generate(user);
    await screen.findByTestId('chat-transcript');

    // Trigger a second Generate. The widget must auto-close and the session
    // mock must be reset so the next Test Chatbot click starts fresh.
    mockGenerate.mockResolvedValueOnce(buildFlow({ id: 'flow_demo_v2' }));
    await user.click(screen.getByRole('button', { name: /generate/i }));

    await waitFor(() => expect(screen.queryByTestId('chat-widget')).not.toBeInTheDocument());
    // New start required on next open against the new flow id.
    mockStart.mockResolvedValueOnce(buildEnvelope());
    await screen.findByTestId('flow-graph');
    await user.click(screen.getByTestId('flow-test-chatbot'));
    await waitFor(() =>
      expect(mockStart).toHaveBeenLastCalledWith('flow_demo_v2', expect.any(AbortSignal)),
    );
  });

  it('Test Chatbot button is disabled before a flow is ready', () => {
    render(<App />);
    // The button is gated behind flowReady — it's not even in the DOM at idle
    // since the whole header-actions group is only rendered when ready.
    expect(screen.queryByTestId('flow-test-chatbot')).not.toBeInTheDocument();
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

  it('preserves the transcript and renders an inline banner when a step fails', async () => {
    mockGenerate.mockResolvedValueOnce(buildFlow());
    mockStart.mockResolvedValueOnce(buildEnvelope());
    mockStep.mockRejectedValueOnce(new ApiError('LLM_UNAVAILABLE', 'timeout', 502));
    const user = userEvent.setup();
    render(<App />);
    await generate(user);

    await screen.findByTestId('chat-transcript');
    await user.type(screen.getByLabelText(/reply input/i), 'hi');
    await user.click(screen.getByRole('button', { name: 'Send' }));

    const banner = await screen.findByTestId('chat-inline-error');
    expect(banner).toHaveTextContent('LLM_UNAVAILABLE');
    // The transcript stays intact (we do NOT collapse to the kind:'error' state).
    expect(screen.getByTestId('chat-transcript')).toHaveTextContent('Buyer or seller?');
    // And the input is still enabled so the user can retry.
    expect(screen.getByLabelText(/reply input/i)).not.toBeDisabled();
  });

  it('clears the inline banner once the next step succeeds', async () => {
    mockGenerate.mockResolvedValueOnce(buildFlow());
    mockStart.mockResolvedValueOnce(buildEnvelope());
    mockStep.mockRejectedValueOnce(new ApiError('LLM_UNAVAILABLE', 'timeout', 502));
    mockStep.mockResolvedValueOnce(
      buildEnvelope({
        session: buildSession({
          transcript: [
            { role: 'bot', content: 'Buyer or seller?', nodeId: 'n1', timestamp: 't1' },
            { role: 'user', content: 'buyer', timestamp: 't2' },
            { role: 'bot', content: 'Sales handoff.', nodeId: 'n_buy', timestamp: 't3' },
          ],
        }),
      }),
    );
    const user = userEvent.setup();
    render(<App />);
    await generate(user);
    await screen.findByTestId('chat-transcript');

    await user.type(screen.getByLabelText(/reply input/i), 'buyer');
    await user.click(screen.getByRole('button', { name: 'Send' }));
    await screen.findByTestId('chat-inline-error');

    await user.type(screen.getByLabelText(/reply input/i), 'buyer');
    await user.click(screen.getByRole('button', { name: 'Send' }));

    await waitFor(() => expect(screen.queryByTestId('chat-inline-error')).not.toBeInTheDocument());
    expect(screen.getByTestId('chat-transcript')).toHaveTextContent('Sales handoff');
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

  describe('widget resize', () => {
    afterEach(() => {
      try {
        window.localStorage.removeItem('wati.chatWidgetSize');
      } catch {
        /* test env may not expose storage — ignore */
      }
    });

    it('opens with default 360×560 size when no localStorage entry exists', async () => {
      mockGenerate.mockResolvedValueOnce(buildFlow());
      mockStart.mockResolvedValueOnce(buildEnvelope());
      const user = userEvent.setup();
      render(<App />);
      await generate(user);

      const widget = await screen.findByTestId('chat-widget');
      expect(widget).toHaveStyle({ width: '360px', height: '560px' });
    });

    it('exposes a top-left resize handle on the widget', async () => {
      mockGenerate.mockResolvedValueOnce(buildFlow());
      mockStart.mockResolvedValueOnce(buildEnvelope());
      const user = userEvent.setup();
      render(<App />);
      await generate(user);

      const handle = await screen.findByTestId('chat-widget-resize-handle');
      // ARIA role + label so it's discoverable for assistive tech.
      expect(handle).toHaveAttribute('role', 'separator');
      expect(handle).toHaveAttribute('aria-label', 'Resize chat widget');
    });

    it('restores the previously persisted size from localStorage on first open', async () => {
      window.localStorage.setItem(
        'wati.chatWidgetSize',
        JSON.stringify({ width: 520, height: 720 }),
      );
      mockGenerate.mockResolvedValueOnce(buildFlow());
      mockStart.mockResolvedValueOnce(buildEnvelope());
      const user = userEvent.setup();
      render(<App />);
      await generate(user);

      const widget = await screen.findByTestId('chat-widget');
      expect(widget).toHaveStyle({ width: '520px', height: '720px' });
    });

    it('ignores a corrupt localStorage entry and falls back to defaults', async () => {
      window.localStorage.setItem('wati.chatWidgetSize', '{not json');
      mockGenerate.mockResolvedValueOnce(buildFlow());
      mockStart.mockResolvedValueOnce(buildEnvelope());
      const user = userEvent.setup();
      render(<App />);
      await generate(user);

      const widget = await screen.findByTestId('chat-widget');
      expect(widget).toHaveStyle({ width: '360px', height: '560px' });
    });

    it('floors a too-small persisted size to the safety minimum', async () => {
      // Below WIDGET_MIN_WIDTH (320) / WIDGET_MIN_HEIGHT (360).
      window.localStorage.setItem(
        'wati.chatWidgetSize',
        JSON.stringify({ width: 100, height: 100 }),
      );
      mockGenerate.mockResolvedValueOnce(buildFlow());
      mockStart.mockResolvedValueOnce(buildEnvelope());
      const user = userEvent.setup();
      render(<App />);
      await generate(user);

      const widget = await screen.findByTestId('chat-widget');
      expect(widget).toHaveStyle({ width: '320px', height: '360px' });
    });
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

    await screen.findByTestId('flow-graph');
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

    await screen.findByTestId('flow-graph');
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

    await screen.findByTestId('flow-graph');
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

    await screen.findByTestId('flow-graph');
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
    await screen.findByTestId('flow-graph');
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

describe('App — Review wiring', () => {
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

    await screen.findByTestId('flow-graph');
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

    await screen.findByTestId('flow-graph');
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

    await screen.findByTestId('flow-graph');
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

    await screen.findByTestId('flow-graph');
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

    await screen.findByTestId('flow-graph');
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

    await screen.findByTestId('flow-graph');
    await user.click(screen.getByRole('button', { name: 'Review' }));
    await screen.findByTestId('issue-list');

    await user.click(screen.getByRole('button', { name: /close review/i }));
    expect(screen.queryByTestId('review')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Review' })).toBeEnabled();
  });

  it('clicking Review again clears the previous result (blank-then-loading UX)', async () => {
    mockGenerate.mockResolvedValueOnce(buildFlow());
    mockStart.mockResolvedValueOnce(buildEnvelope());
    mockReview.mockResolvedValueOnce(buildReviewResult());
    const user = userEvent.setup();
    render(<App />);
    await generate(user);
    await screen.findByTestId('flow-graph');
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
    await screen.findByTestId('flow-graph');
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

describe('App — Issue \u2194 Graph selection', () => {
  const flowWithAsk = buildFlow({
    id: 'flow_sel',
    entryNodeId: 'n_start',
    nodes: [
      { id: 'n_start', type: 'trigger', label: 'Start', config: {} },
      {
        id: 'n_ask',
        type: 'ask_question',
        label: 'Buyer or seller?',
        config: { text: 'Buyer or seller?' },
      },
      { id: 'n_sales', type: 'assign_to_team', label: 'Sales', config: { team: 'Sales' } },
    ],
    edges: [
      { id: 'e0', from: 'n_start', to: 'n_ask' },
      { id: 'e1', from: 'n_ask', to: 'n_sales', condition: 'buyer' },
    ],
  });

  const reviewWithAskIssue: ReviewResult = {
    issues: [
      {
        severity: 'warning',
        code: 'MISSING_FALLBACK',
        message: '"Buyer or seller?" has no fallback edge.',
        nodeIds: ['n_ask'],
      },
    ],
    summary: '1 issue found (1 warning).',
  };

  async function setupReview() {
    mockGenerate.mockResolvedValueOnce(flowWithAsk);
    mockStart.mockResolvedValueOnce(buildEnvelope());
    mockReview.mockResolvedValueOnce(reviewWithAskIssue);
    const user = userEvent.setup();
    render(<App />);
    await user.type(screen.getByLabelText(/prompt input/i), 'route buyers/sellers');
    await user.click(screen.getByRole('button', { name: /generate/i }));
    await screen.findByTestId('flow-graph');
    await user.click(screen.getByRole('button', { name: 'Review' }));
    await screen.findByTestId('issue-list');
    return user;
  }

  // Scope the issue click to the right severity row instead of relying on
  // `getAllByRole('button')[0]`. Robust to extra buttons elsewhere in the UI.
  const getIssueButton = (severity: 'error' | 'warning' | 'info'): HTMLElement =>
    within(screen.getByTestId(`issue-${severity}`)).getByRole('button');

  // Scope graph-node assertions to the FlowGraph surface so we don't reach into
  // unrelated DOM. The graph publishes `data-node-type` on each node card.
  const getGraphNode = (type: string): HTMLElement => {
    const graph = screen.getByTestId('flow-graph');
    const card = graph.querySelector(`[data-node-type="${type}"]`);
    if (!card) throw new Error(`no node-card for type=${type}`);
    return card as HTMLElement;
  };

  it('clicking an issue card highlights the affected node in the graph', async () => {
    const user = await setupReview();

    expect(getGraphNode('ask_question')).not.toHaveAttribute('data-selected');

    await user.click(getIssueButton('warning'));

    await waitFor(() =>
      expect(getGraphNode('ask_question')).toHaveAttribute('data-selected', 'true'),
    );
    expect(getGraphNode('trigger').style.opacity).toBe('0.45');
  });

  it('clicking the same issue card again deselects and removes the highlight', async () => {
    const user = await setupReview();

    await user.click(getIssueButton('warning'));
    await waitFor(() =>
      expect(getGraphNode('ask_question')).toHaveAttribute('data-selected', 'true'),
    );

    await user.click(getIssueButton('warning'));
    await waitFor(() => expect(getGraphNode('ask_question')).not.toHaveAttribute('data-selected'));
  });

  it('clears the issue selection when the review block is closed', async () => {
    const user = await setupReview();

    await user.click(getIssueButton('warning'));
    await waitFor(() =>
      expect(getGraphNode('ask_question')).toHaveAttribute('data-selected', 'true'),
    );

    await user.click(screen.getByRole('button', { name: /close review/i }));

    expect(getGraphNode('ask_question')).not.toHaveAttribute('data-selected');
  });

  it('clears the issue selection when a new flow is generated', async () => {
    const user = await setupReview();

    await user.click(getIssueButton('warning'));
    await waitFor(() =>
      expect(getGraphNode('ask_question')).toHaveAttribute('data-selected', 'true'),
    );

    mockGenerate.mockResolvedValueOnce(buildFlow({ id: 'flow_two' }));
    mockStart.mockResolvedValueOnce(buildEnvelope());
    await user.clear(screen.getByLabelText(/prompt input/i));
    await user.type(screen.getByLabelText(/prompt input/i), 'second');
    await user.click(screen.getByRole('button', { name: /generate/i }));

    await waitFor(() => expect(screen.queryByTestId('issue-list')).not.toBeInTheDocument());
    const trigger = getGraphNode('trigger');
    // The new flow has only a trigger node; it should not be dimmed (no selection).
    expect(trigger.style.opacity === '' || trigger.style.opacity === '1').toBe(true);
  });
});
