// @vitest-environment happy-dom
import '@testing-library/jest-dom/vitest';

import type { Session } from 'shared';
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

  it('renders an events disclosure with branch + handoff lines when events are present', () => {
    const status: SimulationStatus = {
      kind: 'active',
      envelope: buildEnvelope({
        events: [
          { type: 'branch', from: 'n1', to: 'n_buy', condition: 'buyer' },
          { type: 'handoff', nodeId: 'n_buy', team: 'Sales' },
        ],
      }),
    };
    render(<ChatPanel status={status} onStep={vi.fn()} onReset={vi.fn()} />);
    const events = screen.getByTestId('chat-events');
    expect(events).toHaveTextContent(/branch/i);
    expect(events).toHaveTextContent('n1 → n_buy');
    expect(events).toHaveTextContent(/handoff/i);
    expect(events).toHaveTextContent('Sales');
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
