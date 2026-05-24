// @vitest-environment happy-dom
import '@testing-library/jest-dom/vitest';

import type { Flow, Session } from 'shared';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type { SessionEnvelope } from '../api.js';
import type { SimulationStatus } from '../state.js';
import { ChatPanel } from './ChatPanel.js';

const buildSession = (overrides: Partial<Session> = {}): Session => ({
  id: 'sess_1',
  flowId: 'flow_1',
  currentNodeId: 'n1',
  status: 'waiting_for_input',
  transcript: [{ role: 'bot', content: 'Buyer or seller?', nodeId: 'n1', timestamp: 't1' }],
  context: { retryCount: 0 },
  ...overrides,
});

const buildEnvelope = (overrides: Partial<SessionEnvelope> = {}): SessionEnvelope => ({
  session: buildSession(),
  botMessages: ['Buyer or seller?'],
  events: [],
  ...overrides,
});

describe('ChatPanel', () => {
  it('renders a placeholder when status is inactive', () => {
    render(<ChatPanel status={{ kind: 'inactive' }} onStep={vi.fn()} onReset={vi.fn()} />);
    expect(screen.getByText(/no simulation yet/i)).toBeInTheDocument();
  });

  it('renders a starting hint while the simulation is bootstrapping', () => {
    render(<ChatPanel status={{ kind: 'starting' }} onStep={vi.fn()} onReset={vi.fn()} />);
    expect(screen.getByText(/starting simulation/i)).toBeInTheDocument();
  });

  it('renders an alert with code + message on error', () => {
    render(
      <ChatPanel
        status={{
          kind: 'error',
          error: { code: 'SESSION_NOT_FOUND', message: 'gone', status: 404 },
        }}
        onStep={vi.fn()}
        onReset={vi.fn()}
      />,
    );
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('SESSION_NOT_FOUND');
    expect(alert).toHaveTextContent('gone');
  });

  it('renders transcript bubbles with bot/user role attributes', () => {
    const status: SimulationStatus = {
      kind: 'active',
      envelope: buildEnvelope({
        session: buildSession({
          transcript: [
            { role: 'bot', content: 'Buyer or seller?', nodeId: 'n1', timestamp: 't1' },
            { role: 'user', content: 'buyer', timestamp: 't2' },
          ],
        }),
      }),
    };
    render(<ChatPanel status={status} onStep={vi.fn()} onReset={vi.fn()} />);

    const bubbles = screen.getAllByRole('listitem');
    expect(bubbles).toHaveLength(2);
    expect(bubbles[0]).toHaveAttribute('data-role', 'bot');
    expect(bubbles[0]).toHaveTextContent('Buyer or seller?');
    expect(bubbles[1]).toHaveAttribute('data-role', 'user');
    expect(bubbles[1]).toHaveTextContent('buyer');
  });

  it('invokes onStep with the trimmed draft and clears the input', async () => {
    const onStep = vi.fn();
    const status: SimulationStatus = { kind: 'active', envelope: buildEnvelope() };
    const user = userEvent.setup();
    render(<ChatPanel status={status} onStep={onStep} onReset={vi.fn()} />);

    const input = screen.getByLabelText(/reply input/i);
    await user.type(input, '  buyer  ');
    await user.click(screen.getByRole('button', { name: /send/i }));

    expect(onStep).toHaveBeenCalledTimes(1);
    expect(onStep).toHaveBeenCalledWith('buyer');
    expect((input as HTMLInputElement).value).toBe('');
  });

  it('disables input + send while pending step', () => {
    const status: SimulationStatus = {
      kind: 'active',
      envelope: buildEnvelope(),
      pending: 'step',
    };
    render(<ChatPanel status={status} onStep={vi.fn()} onReset={vi.fn()} />);
    expect(screen.getByLabelText(/reply input/i)).toBeDisabled();
    expect(screen.getByRole('button', { name: /sending/i })).toBeDisabled();
  });

  it('shows the terminal banner + disables input for completed/handed_off', () => {
    const status: SimulationStatus = {
      kind: 'active',
      envelope: buildEnvelope({
        session: buildSession({ status: 'handed_off' }),
      }),
    };
    render(<ChatPanel status={status} onStep={vi.fn()} onReset={vi.fn()} />);
    expect(screen.getByRole('status')).toHaveTextContent(/handed off/i);
    expect(screen.getByLabelText(/reply input/i)).toBeDisabled();
  });

  describe('debug toggle (designer-only step trace)', () => {
    const eventStatus = (): SimulationStatus => ({
      kind: 'active',
      envelope: buildEnvelope({
        events: [
          { type: 'branch', from: 'n1', to: 'n_buy', condition: 'buyer' },
          { type: 'handoff', nodeId: 'n_buy', team: 'Sales' },
        ],
      }),
    });

    it('hides the step trace by default even when events are present', () => {
      render(<ChatPanel status={eventStatus()} onStep={vi.fn()} onReset={vi.fn()} />);
      expect(screen.queryByTestId('chat-events')).not.toBeInTheDocument();
    });

    it('exposes a Debug toggle with aria-pressed=false initially', () => {
      render(<ChatPanel status={eventStatus()} onStep={vi.fn()} onReset={vi.fn()} />);
      const toggle = screen.getByTestId('chat-debug-toggle');
      expect(toggle).toHaveAttribute('aria-pressed', 'false');
    });

    it('reveals the step trace with branch + handoff lines after toggling Debug on', async () => {
      const user = userEvent.setup();
      render(<ChatPanel status={eventStatus()} onStep={vi.fn()} onReset={vi.fn()} />);
      await user.click(screen.getByTestId('chat-debug-toggle'));

      const events = screen.getByTestId('chat-events');
      expect(events).toHaveTextContent(/branch/i);
      expect(events).toHaveTextContent('n1 → n_buy');
      expect(events).toHaveTextContent(/handoff/i);
      expect(events).toHaveTextContent('Sales');
      // Designer-view label reminds operators that end-users never see this.
      expect(events).toHaveTextContent(/designer view/i);
      expect(screen.getByTestId('chat-debug-toggle')).toHaveAttribute('aria-pressed', 'true');
    });

    it('hides the trace again when Debug is toggled off', async () => {
      const user = userEvent.setup();
      render(<ChatPanel status={eventStatus()} onStep={vi.fn()} onReset={vi.fn()} />);
      const toggle = screen.getByTestId('chat-debug-toggle');
      await user.click(toggle);
      expect(screen.getByTestId('chat-events')).toBeInTheDocument();
      await user.click(toggle);
      expect(screen.queryByTestId('chat-events')).not.toBeInTheDocument();
    });

    it('does not render the Debug toggle when no simulation is active', () => {
      render(<ChatPanel status={{ kind: 'inactive' }} onStep={vi.fn()} onReset={vi.fn()} />);
      expect(screen.queryByTestId('chat-debug-toggle')).not.toBeInTheDocument();
    });

    it('keeps the trace hidden once toggled on if the executor produced zero events', async () => {
      const user = userEvent.setup();
      const status: SimulationStatus = {
        kind: 'active',
        envelope: buildEnvelope({ events: [] }),
      };
      render(<ChatPanel status={status} onStep={vi.fn()} onReset={vi.fn()} />);
      await user.click(screen.getByTestId('chat-debug-toggle'));
      // Debug is on, but no events to show — the disclosure stays absent so the
      // designer doesn't see an empty "trace" header.
      expect(screen.queryByTestId('chat-events')).not.toBeInTheDocument();
    });

    it('renders node labels from the flow instead of raw IDs when flow is provided', async () => {
      const user = userEvent.setup();
      const flow: Flow = {
        id: 'flow_1',
        name: 'Support routing',
        prompt: 'test',
        trigger: { type: 'new_message' },
        entryNodeId: 'n0',
        nodes: [
          { id: 'n0', type: 'trigger', label: 'Trigger', config: {} },
          { id: 'n1', type: 'ask_question', label: 'Ask department', config: { text: 'Which?' } },
          {
            id: 'n2',
            type: 'assign_to_team',
            label: 'Billing Team handoff',
            config: { team: 'Billing' },
          },
        ],
        edges: [],
        createdAt: '2026-05-24T00:00:00.000Z',
      };
      const status: SimulationStatus = {
        kind: 'active',
        envelope: buildEnvelope({
          events: [
            { type: 'branch', from: 'n1', to: 'n2', condition: 'Billing' },
            { type: 'handoff', nodeId: 'n2', team: 'Billing' },
          ],
        }),
      };
      render(<ChatPanel status={status} onStep={vi.fn()} onReset={vi.fn()} flow={flow} />);
      await user.click(screen.getByTestId('chat-debug-toggle'));

      const events = screen.getByTestId('chat-events');
      // Labels are visible to the reader…
      expect(events).toHaveTextContent('Ask department');
      expect(events).toHaveTextContent('Billing Team handoff');
      // …and the raw IDs are NOT what the user reads — they only live in the
      // hover-tooltip title attribute. So neither "n1" nor "n2" should appear
      // anywhere except inside a `title` (which `toHaveTextContent` excludes).
      expect(events).not.toHaveTextContent(/\bn1\b/);
      expect(events).not.toHaveTextContent(/\bn2\b/);
      // Tooltip carries id + type for designers who need the raw reference.
      const noderefs = events.querySelectorAll('.event-noderef');
      expect(noderefs.length).toBeGreaterThan(0);
      const titles = Array.from(noderefs).map((n) => n.getAttribute('title') ?? '');
      expect(titles.some((t) => t.includes('n1') && t.includes('ask_question'))).toBe(true);
      expect(titles.some((t) => t.includes('n2') && t.includes('assign_to_team'))).toBe(true);
    });

    it('falls back to the raw node ID when the matching label is empty', async () => {
      const user = userEvent.setup();
      const flow: Flow = {
        id: 'flow_1',
        name: 'flow',
        prompt: 'test',
        trigger: { type: 'new_message' },
        entryNodeId: 'n0',
        nodes: [
          { id: 'n0', type: 'trigger', label: 'Trigger', config: {} },
          // Whitespace-only label is treated as missing — we'd rather show the
          // ID than a blank in the trace.
          { id: 'n1', type: 'ask_question', label: '   ', config: { text: 'q' } },
        ],
        edges: [],
        createdAt: '2026-05-24T00:00:00.000Z',
      };
      const status: SimulationStatus = {
        kind: 'active',
        envelope: buildEnvelope({
          events: [{ type: 'fallback', nodeId: 'n1', reason: 'unmatched reply' }],
        }),
      };
      render(<ChatPanel status={status} onStep={vi.fn()} onReset={vi.fn()} flow={flow} />);
      await user.click(screen.getByTestId('chat-debug-toggle'));
      expect(screen.getByTestId('chat-events')).toHaveTextContent(/\bn1\b/);
    });
  });

  it('invokes onReset when the Reset button is clicked', async () => {
    const onReset = vi.fn();
    const status: SimulationStatus = { kind: 'active', envelope: buildEnvelope() };
    const user = userEvent.setup();
    render(<ChatPanel status={status} onStep={vi.fn()} onReset={onReset} />);

    await user.click(screen.getByRole('button', { name: /reset/i }));
    expect(onReset).toHaveBeenCalledTimes(1);
  });

  describe('transient error banner', () => {
    it('keeps the transcript and renders an inline banner when lastError is set', () => {
      const status: SimulationStatus = {
        kind: 'active',
        envelope: buildEnvelope(),
        lastError: { code: 'LLM_UNAVAILABLE', message: 'timeout', status: 502 },
      };
      render(<ChatPanel status={status} onStep={vi.fn()} onReset={vi.fn()} />);

      // Transcript stays visible…
      expect(screen.getByTestId('chat-transcript')).toBeInTheDocument();
      expect(screen.getByText('Buyer or seller?')).toBeInTheDocument();
      // …and the banner is rendered with code + message + recovery hint.
      const banner = screen.getByTestId('chat-inline-error');
      expect(banner).toHaveTextContent('LLM_UNAVAILABLE');
      expect(banner).toHaveTextContent('timeout');
      expect(banner).toHaveTextContent(/transcript preserved/i);
    });

    it('keeps the input enabled after a transient failure so the user can retry', () => {
      const status: SimulationStatus = {
        kind: 'active',
        envelope: buildEnvelope(),
        lastError: { code: 'LLM_UNAVAILABLE', message: 'timeout', status: 502 },
      };
      render(<ChatPanel status={status} onStep={vi.fn()} onReset={vi.fn()} />);
      expect(screen.getByLabelText(/reply input/i)).not.toBeDisabled();
    });

    it('does NOT render the inline banner when lastError is absent', () => {
      const status: SimulationStatus = { kind: 'active', envelope: buildEnvelope() };
      render(<ChatPanel status={status} onStep={vi.fn()} onReset={vi.fn()} />);
      expect(screen.queryByTestId('chat-inline-error')).not.toBeInTheDocument();
    });
  });

  describe('quick-reply chips', () => {
    it('renders one chip per expectedReply when awaitingInput supplies them', () => {
      const status: SimulationStatus = {
        kind: 'active',
        envelope: buildEnvelope({
          awaitingInput: {
            nodeId: 'n1',
            text: 'Buyer or seller?',
            expectedReplies: ['buyer', 'seller'],
          },
        }),
      };
      render(<ChatPanel status={status} onStep={vi.fn()} onReset={vi.fn()} />);

      const chips = screen.getAllByRole('button', { name: /^(buyer|seller)$/ });
      expect(chips).toHaveLength(2);
      expect(chips[0]).toHaveTextContent('buyer');
      expect(chips[1]).toHaveTextContent('seller');
    });

    it('submits the chip text as a user message when clicked', async () => {
      const onStep = vi.fn();
      const status: SimulationStatus = {
        kind: 'active',
        envelope: buildEnvelope({
          awaitingInput: {
            nodeId: 'n1',
            text: 'Buyer or seller?',
            expectedReplies: ['buyer', 'seller'],
          },
        }),
      };
      const user = userEvent.setup();
      render(<ChatPanel status={status} onStep={onStep} onReset={vi.fn()} />);

      await user.click(screen.getByRole('button', { name: 'seller' }));
      expect(onStep).toHaveBeenCalledTimes(1);
      expect(onStep).toHaveBeenCalledWith('seller');
    });

    it('disables chips while a step is pending so the user cannot double-fire', () => {
      const status: SimulationStatus = {
        kind: 'active',
        pending: 'step',
        envelope: buildEnvelope({
          awaitingInput: {
            nodeId: 'n1',
            text: 'Buyer or seller?',
            expectedReplies: ['buyer', 'seller'],
          },
        }),
      };
      render(<ChatPanel status={status} onStep={vi.fn()} onReset={vi.fn()} />);
      for (const chip of screen.getAllByRole('button', { name: /^(buyer|seller)$/ })) {
        expect(chip).toBeDisabled();
      }
    });

    it('renders nothing when expectedReplies is absent from awaitingInput', () => {
      const status: SimulationStatus = {
        kind: 'active',
        envelope: buildEnvelope({
          awaitingInput: { nodeId: 'n1', text: 'Free text question' },
        }),
      };
      render(<ChatPanel status={status} onStep={vi.fn()} onReset={vi.fn()} />);
      expect(screen.queryByTestId('chat-quickreplies')).not.toBeInTheDocument();
    });

    it('does not render chips after the conversation reaches a terminal state', () => {
      const status: SimulationStatus = {
        kind: 'active',
        envelope: buildEnvelope({
          session: buildSession({ status: 'completed' }),
          awaitingInput: {
            nodeId: 'n1',
            text: 'Buyer or seller?',
            expectedReplies: ['buyer', 'seller'],
          },
        }),
      };
      render(<ChatPanel status={status} onStep={vi.fn()} onReset={vi.fn()} />);
      expect(screen.queryByTestId('chat-quickreplies')).not.toBeInTheDocument();
    });
  });

  describe('typing indicator', () => {
    it('renders a typing bubble in the transcript while a step is pending', () => {
      const status: SimulationStatus = {
        kind: 'active',
        envelope: buildEnvelope(),
        pending: 'step',
      };
      render(<ChatPanel status={status} onStep={vi.fn()} onReset={vi.fn()} />);
      const typing = screen.getByTestId('chat-typing');
      expect(typing).toBeInTheDocument();
      expect(typing).toHaveAttribute('aria-label', 'Bot is typing');
      // Sits inside the transcript list — visually it's a bot-side bubble.
      expect(typing.closest('[data-testid="chat-transcript"]')).not.toBeNull();
    });

    it('does NOT render the typing bubble in steady-state', () => {
      const status: SimulationStatus = { kind: 'active', envelope: buildEnvelope() };
      render(<ChatPanel status={status} onStep={vi.fn()} onReset={vi.fn()} />);
      expect(screen.queryByTestId('chat-typing')).not.toBeInTheDocument();
    });
  });

  describe('bubble timestamps', () => {
    it('exposes each message timestamp as a <time> element so the chrome matches WhatsApp', () => {
      const status: SimulationStatus = {
        kind: 'active',
        envelope: buildEnvelope({
          session: buildSession({
            transcript: [
              {
                role: 'bot',
                content: 'Buyer or seller?',
                nodeId: 'n1',
                timestamp: '2026-05-23T15:30:00.000Z',
              },
            ],
          }),
        }),
      };
      const { container } = render(
        <ChatPanel status={status} onStep={vi.fn()} onReset={vi.fn()} />,
      );
      const timeEl = container.querySelector('time');
      expect(timeEl).not.toBeNull();
      expect(timeEl).toHaveAttribute('datetime', '2026-05-23T15:30:00.000Z');
      // Format is HH:MM; locale-dependent but always has the colon.
      expect(timeEl!.textContent).toMatch(/\d{2}:\d{2}/);
    });
  });
});
