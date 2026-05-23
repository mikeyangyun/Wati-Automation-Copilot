import { useState, type FormEvent } from 'react';
import type { Message, SimulationEvent } from 'shared';

import type { SessionEnvelope } from '../api.js';
import type { SimulationStatus } from '../state.js';

export interface ChatPanelProps {
  status: SimulationStatus;
  onStep: (message: string) => void;
  onReset: () => void;
}

export function ChatPanel({ status, onStep, onReset }: ChatPanelProps) {
  return (
    <section className="panel chat-panel" aria-label="Mock chat">
      <header className="chat-header">
        <h2>Chat</h2>
        {status.kind === 'active' && (
          <button
            type="button"
            className="chat-reset"
            onClick={onReset}
            disabled={status.pending !== undefined}
          >
            Reset
          </button>
        )}
      </header>
      <ChatPanelBody status={status} onStep={onStep} />
    </section>
  );
}

function ChatPanelBody({
  status,
  onStep,
}: {
  status: SimulationStatus;
  onStep: (message: string) => void;
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
      return <ActiveChat envelope={status.envelope} pending={status.pending} onStep={onStep} />;
  }
}

function ActiveChat({
  envelope,
  pending,
  onStep,
}: {
  envelope: SessionEnvelope;
  pending: 'step' | 'reset' | undefined;
  onStep: (message: string) => void;
}) {
  const [draft, setDraft] = useState('');
  const terminal =
    envelope.session.status === 'completed' || envelope.session.status === 'handed_off';
  const inputDisabled = terminal || pending !== undefined;

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const trimmed = draft.trim();
    if (!trimmed || inputDisabled) return;
    setDraft('');
    onStep(trimmed);
  };

  return (
    <>
      <ul className="chat-transcript" data-testid="chat-transcript">
        {envelope.session.transcript.map((msg, idx) => (
          <Bubble key={`${idx}-${msg.timestamp}`} msg={msg} />
        ))}
      </ul>

      {envelope.events.length > 0 && (
        <details className="chat-events" data-testid="chat-events">
          <summary>Last step trace ({envelope.events.length})</summary>
          <ul>
            {envelope.events.map((event, idx) => (
              <li key={idx}>
                <EventLine event={event} />
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

      <form className="chat-form" onSubmit={handleSubmit}>
        <input
          type="text"
          className="chat-input"
          aria-label="Reply input"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          disabled={inputDisabled}
          placeholder={terminal ? 'Conversation ended — Reset to retry' : 'Type a reply…'}
        />
        <button
          type="submit"
          className="chat-send"
          disabled={inputDisabled || draft.trim().length === 0}
        >
          {pending === 'step' ? 'Sending…' : 'Send'}
        </button>
      </form>
    </>
  );
}

function Bubble({ msg }: { msg: Message }) {
  return (
    <li className={`chat-bubble chat-bubble-${msg.role}`} data-role={msg.role}>
      <span className="chat-bubble-content">{msg.content}</span>
    </li>
  );
}

function EventLine({ event }: { event: SimulationEvent }) {
  switch (event.type) {
    case 'branch':
      return (
        <span>
          <code className="event-tag event-branch">branch</code> {event.from} → {event.to}
          {event.condition !== undefined ? ` (on "${event.condition}")` : ''}
        </span>
      );
    case 'fallback':
      return (
        <span>
          <code className="event-tag event-fallback">fallback</code> {event.nodeId}: {event.reason}
        </span>
      );
    case 'retry':
      return (
        <span>
          <code className="event-tag event-retry">retry</code> {event.nodeId} (×{event.count})
        </span>
      );
    case 'mock-api-call':
      return (
        <span>
          <code className="event-tag event-api">mock api</code> {event.nodeId}
          {event.url !== undefined ? ` → ${event.url}` : ''}
        </span>
      );
    case 'handoff':
      return (
        <span>
          <code className="event-tag event-handoff">handoff</code> {event.nodeId} → team{' '}
          <strong>{event.team}</strong>
        </span>
      );
  }
}
