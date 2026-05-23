import { useCallback, useEffect, useRef, useState } from 'react';

import {
  ApiError,
  generateFlow,
  resetSession,
  startSession,
  stepSession,
  type SessionEnvelope,
} from './api.js';
import { ChatPanel } from './panels/ChatPanel.js';
import { FlowPanel } from './panels/FlowPanel.js';
import { PromptPanel } from './panels/PromptPanel.js';
import type { AppErrorSummary, AppStatus, SimulationStatus } from './state.js';

export function App() {
  const [prompt, setPrompt] = useState('');
  const [status, setStatus] = useState<AppStatus>({ kind: 'idle' });
  const [simStatus, setSimStatus] = useState<SimulationStatus>({ kind: 'inactive' });
  const generateAbortRef = useRef<AbortController | null>(null);
  const simAbortRef = useRef<AbortController | null>(null);
  // Mirror of simStatus, so step/reset handlers can read the current sessionId
  // without depending on it (which would re-create the callbacks on every keystroke).
  const simStatusRef = useRef<SimulationStatus>(simStatus);
  useEffect(() => {
    simStatusRef.current = simStatus;
  }, [simStatus]);

  // Abort any in-flight network on unmount, for both lifecycles.
  useEffect(
    () => () => {
      generateAbortRef.current?.abort();
      simAbortRef.current?.abort();
    },
    [],
  );

  // Auto-start a simulation session every time a (new) flow becomes ready.
  const flowId = status.kind === 'ready' ? status.flow.id : null;
  useEffect(() => {
    if (flowId === null) return;
    simAbortRef.current?.abort();
    const controller = new AbortController();
    simAbortRef.current = controller;
    setSimStatus({ kind: 'starting' });
    void (async () => {
      try {
        const envelope = await startSession(flowId, controller.signal);
        if (controller.signal.aborted) return;
        setSimStatus({ kind: 'active', envelope });
      } catch (err) {
        if (controller.signal.aborted) return;
        setSimStatus({ kind: 'error', error: summariseError(err) });
      }
    })();
  }, [flowId]);

  const handleSubmit = useCallback(async () => {
    if (!prompt.trim()) return;
    generateAbortRef.current?.abort();
    simAbortRef.current?.abort();
    const controller = new AbortController();
    generateAbortRef.current = controller;
    setStatus({ kind: 'generating' });
    setSimStatus({ kind: 'inactive' });
    try {
      const flow = await generateFlow(prompt, controller.signal);
      if (controller.signal.aborted) return;
      setStatus({ kind: 'ready', flow });
    } catch (err) {
      if (controller.signal.aborted) return;
      setStatus({ kind: 'error', error: summariseError(err) });
    }
  }, [prompt]);

  const handleStep = useCallback(async (message: string) => {
    const current = simStatusRef.current;
    if (current.kind !== 'active') return;
    const sessionId = current.envelope.session.id;

    setSimStatus((s) => (s.kind === 'active' ? { ...s, pending: 'step' } : s));
    simAbortRef.current?.abort();
    const controller = new AbortController();
    simAbortRef.current = controller;
    try {
      const envelope = await stepSession(sessionId, message, controller.signal);
      if (controller.signal.aborted) return;
      setSimStatus({ kind: 'active', envelope });
    } catch (err) {
      if (controller.signal.aborted) return;
      setSimStatus({ kind: 'error', error: summariseError(err) });
    }
  }, []);

  const handleReset = useCallback(async () => {
    const current = simStatusRef.current;
    if (current.kind !== 'active') return;
    const sessionId = current.envelope.session.id;

    setSimStatus((s) => (s.kind === 'active' ? { ...s, pending: 'reset' } : s));
    simAbortRef.current?.abort();
    const controller = new AbortController();
    simAbortRef.current = controller;
    try {
      const envelope = await resetSession(sessionId, controller.signal);
      if (controller.signal.aborted) return;
      setSimStatus({ kind: 'active', envelope });
    } catch (err) {
      if (controller.signal.aborted) return;
      setSimStatus({ kind: 'error', error: summariseError(err) });
    }
  }, []);

  return (
    <div className="app">
      <header className="header">
        <h1>Wati Automation Builder Copilot</h1>
      </header>
      <main className="panels">
        <PromptPanel
          prompt={prompt}
          onPromptChange={setPrompt}
          onSubmit={handleSubmit}
          isGenerating={status.kind === 'generating'}
        />
        <FlowPanel status={status} />
        <ChatPanel status={simStatus} onStep={handleStep} onReset={handleReset} />
      </main>
    </div>
  );
}

function summariseError(err: unknown): AppErrorSummary {
  if (err instanceof ApiError) {
    return { code: err.code, message: err.message, status: err.status };
  }
  return {
    code: 'UNKNOWN',
    message: err instanceof Error ? err.message : String(err),
    status: 0,
  };
}

// Re-export for test convenience; keeps the side-effect type imports tree-shakeable.
export type { SessionEnvelope };
