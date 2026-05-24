import { useState, type FormEvent } from 'react';
import type { AwaitingInput, Flow, Message, SimulationEvent } from 'shared';

import type { SessionEnvelope } from '../api.js';
import type { AppErrorSummary, SimulationStatus } from '../state.js';

export interface ChatPanelProps {
  status: SimulationStatus;
  onStep: (message: string) => void;
  onReset: () => void;
  /**
   * Optional currently-generated flow. Used purely to resolve node IDs in the
   * debug step trace to human-readable labels — designers shouldn't need to
   * memorise that `n3` is the "Billing sub-issue" question. Falls back to the
   * raw ID when the flow isn't available.
   */
  flow?: Flow;
}

export function ChatPanel({ status, onStep, onReset, flow }: ChatPanelProps) {
  // Debug toggle defaults to OFF so the chat panel reads like a real WhatsApp
  // preview. Designers can opt in to see the executor's step trace (which
  // branch was taken, which fallback fired, etc.). End-users of the live bot
  // never see this — it only exists in the simulator's envelope.
  const [debug, setDebug] = useState(false);
  const active = status.kind === 'active';

  return (
    <section className="panel chat-panel" aria-label="Mock chat">
      <header className="chat-header">
        <h2>Chat</h2>
        {active && (
          <div className="chat-header-actions">
            <button
              type="button"
              className={`chat-debug-toggle${debug ? ' chat-debug-toggle-on' : ''}`}
              onClick={() => setDebug((d) => !d)}
              aria-pressed={debug}
              aria-label="Toggle flow trace (designer view)"
              title="Show the step trace — only visible in this simulator, never sent to end-users."
              data-testid="chat-debug-toggle"
            >
              <span className="chat-debug-dot" aria-hidden="true" />
              Debug
            </button>
            <button
              type="button"
              className="chat-reset"
              onClick={onReset}
              disabled={status.pending !== undefined}
            >
              Reset
            </button>
          </div>
        )}
      </header>
      <ChatPanelBody status={status} onStep={onStep} debug={debug} flow={flow} />
    </section>
  );
}

function ChatPanelBody({
  status,
  onStep,
  debug,
  flow,
}: {
  status: SimulationStatus;
  onStep: (message: string) => void;
  debug: boolean;
  flow?: Flow;
}) {
  switch (status.kind) {
    case 'inactive':
      return (
        <p className="placeholder">
          No simulation yet. Generate a flow on the left to start chatting.
        </p>
      );
    case 'starting':
      return <p className="placeholder">Starting simulation…</p>;
    case 'error':
      return (
        <div className="chat-error" role="alert">
          <strong>{status.error.code}</strong>
          <p>{status.error.message}</p>
        </div>
      );
    case 'active':
      return (
        <ActiveChat
          envelope={status.envelope}
          pending={status.pending}
          lastError={status.lastError}
          onStep={onStep}
          debug={debug}
          flow={flow}
        />
      );
  }
}

function ActiveChat({
  envelope,
  pending,
  lastError,
  onStep,
  debug,
  flow,
}: {
  envelope: SessionEnvelope;
  pending: 'step' | 'reset' | undefined;
  lastError: AppErrorSummary | undefined;
  onStep: (message: string) => void;
  debug: boolean;
  flow?: Flow;
}) {
  const [draft, setDraft] = useState('');
  const terminal =
    envelope.session.status === 'completed' || envelope.session.status === 'handed_off';
  const stepping = pending === 'step';
  const inputDisabled = terminal || pending !== undefined;
  const awaitingInput = envelope.awaitingInput;
  const quickReplies = awaitingInput?.expectedReplies;

  const submit = (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || inputDisabled) return;
    setDraft('');
    onStep(trimmed);
  };

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    submit(draft);
  };

  return (
    <>
      <ul className="chat-transcript" data-testid="chat-transcript">
        {envelope.session.transcript.map((msg, idx) => (
          <Bubble key={`${idx}-${msg.timestamp}`} msg={msg} />
        ))}
        {stepping && (
          <li
            className="chat-bubble chat-bubble-bot chat-bubble-typing"
            data-testid="chat-typing"
            aria-label="Bot is typing"
          >
            <span className="chat-typing-dots" aria-hidden="true">
              <span />
              <span />
              <span />
            </span>
          </li>
        )}
      </ul>

      {debug && envelope.events.length > 0 && (
        <details className="chat-events" data-testid="chat-events" open>
          <summary>
            Last step trace ({envelope.events.length})
            <span className="chat-events-hint">designer view · hidden from end-users</span>
          </summary>
          <ul>
            {envelope.events.map((event, idx) => (
              <li key={idx}>
                <EventLine event={event} flow={flow} />
              </li>
            ))}
          </ul>
        </details>
      )}

      {terminal && (
        <div className="chat-terminal" role="status">
          {envelope.session.status === 'completed'
            ? 'Conversation completed.'
            : 'Conversation handed off to a human team.'}
        </div>
      )}

      {lastError !== undefined && (
        <div className="chat-inline-error" role="alert" data-testid="chat-inline-error">
          <strong>{lastError.code}</strong>
          <span className="chat-inline-error-msg">{lastError.message}</span>
          <span className="chat-inline-error-hint">Transcript preserved — try sending again.</span>
        </div>
      )}

      {!terminal && quickReplies !== undefined && (
        <QuickReplies replies={quickReplies} disabled={inputDisabled} onPick={submit} />
      )}

      <form className="chat-form" onSubmit={handleSubmit}>
        <input
          type="text"
          className="chat-input"
          aria-label="Reply input"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          disabled={inputDisabled}
          placeholder={
            terminal
              ? 'Conversation ended — Reset to retry'
              : quickReplies !== undefined
                ? 'Pick a quick reply or type your own…'
                : 'Type a reply…'
          }
        />
        <button
          type="submit"
          className="chat-send"
          disabled={inputDisabled || draft.trim().length === 0}
        >
          {stepping ? 'Sending…' : 'Send'}
        </button>
      </form>
    </>
  );
}

function QuickReplies({
  replies,
  disabled,
  onPick,
}: {
  replies: NonNullable<AwaitingInput['expectedReplies']>;
  disabled: boolean;
  onPick: (reply: string) => void;
}) {
  return (
    <div
      className="chat-quickreplies"
      data-testid="chat-quickreplies"
      role="group"
      aria-label="Quick replies"
    >
      {replies.map((reply) => (
        <button
          key={reply}
          type="button"
          className="chat-quickreply"
          disabled={disabled}
          onClick={() => onPick(reply)}
        >
          {reply}
        </button>
      ))}
    </div>
  );
}

function Bubble({ msg }: { msg: Message }) {
  return (
    <li className={`chat-bubble chat-bubble-${msg.role}`} data-role={msg.role}>
      <span className="chat-bubble-content">{msg.content}</span>
      <time className="chat-bubble-time" dateTime={msg.timestamp}>
        {formatBubbleTime(msg.timestamp)}
      </time>
    </li>
  );
}

function formatBubbleTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', hour12: false });
}

/**
 * Renders a single step-trace event. When a flow is provided, node IDs are
 * replaced with their human-readable `label` so a non-engineer can follow
 * "Ask department → Billing sub-issue" instead of "n2 → n3". The raw ID and
 * node type are still surfaced via the `title` attribute for hover-debugging.
 */
function EventLine({ event, flow }: { event: SimulationEvent; flow?: Flow }) {
  const nodeById = new Map(flow?.nodes.map((n) => [n.id, n]) ?? []);
  const labelOf = (id: string): string => {
    const node = nodeById.get(id);
    return node?.label && node.label.trim().length > 0 ? node.label : id;
  };
  const titleOf = (id: string): string => {
    const node = nodeById.get(id);
    return node ? `${id} · ${node.type}` : id;
  };

  const NodeRef = ({ id }: { id: string }) => (
    <span className="event-noderef" title={titleOf(id)}>
      {labelOf(id)}
    </span>
  );

  switch (event.type) {
    case 'branch':
      return (
        <span>
          <code className="event-tag event-branch">branch</code> <NodeRef id={event.from} />
          {' → '}
          <NodeRef id={event.to} />
          {event.condition !== undefined ? (
            <>
              {' on '}
              <strong>&quot;{event.condition}&quot;</strong>
            </>
          ) : null}
        </span>
      );
    case 'fallback':
      return (
        <span>
          <code className="event-tag event-fallback">fallback</code> at{' '}
          <NodeRef id={event.nodeId} /> — {event.reason}
        </span>
      );
    case 'retry':
      return (
        <span>
          <code className="event-tag event-retry">retry</code> at <NodeRef id={event.nodeId} /> (×
          {event.count})
        </span>
      );
    case 'mock-api-call':
      return (
        <span>
          <code className="event-tag event-api">mock api</code> at <NodeRef id={event.nodeId} />
          {event.url !== undefined ? ` → ${event.url}` : ''}
        </span>
      );
    case 'handoff':
      return (
        <span>
          <code className="event-tag event-handoff">handoff</code> at <NodeRef id={event.nodeId} />{' '}
          → team <strong>{event.team}</strong>
        </span>
      );
  }
}
