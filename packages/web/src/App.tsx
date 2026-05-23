import { useCallback, useEffect, useRef, useState } from 'react';

import { ApiError, generateFlow } from './api.js';
import { FlowPanel } from './panels/FlowPanel.js';
import { PromptPanel } from './panels/PromptPanel.js';
import type { AppStatus } from './state.js';

export function App() {
  const [prompt, setPrompt] = useState('');
  const [status, setStatus] = useState<AppStatus>({ kind: 'idle' });
  const abortRef = useRef<AbortController | null>(null);

  useEffect(
    () => () => {
      abortRef.current?.abort();
    },
    [],
  );

  const handleSubmit = useCallback(async () => {
    if (!prompt.trim()) return;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setStatus({ kind: 'generating' });
    try {
      const flow = await generateFlow(prompt, controller.signal);
      if (controller.signal.aborted) return;
      setStatus({ kind: 'ready', flow });
    } catch (err) {
      if (controller.signal.aborted) return;
      if (err instanceof ApiError) {
        setStatus({
          kind: 'error',
          error: { code: err.code, message: err.message, status: err.status },
        });
        return;
      }
      setStatus({
        kind: 'error',
        error: {
          code: 'UNKNOWN',
          message: err instanceof Error ? err.message : String(err),
          status: 0,
        },
      });
    }
  }, [prompt]);

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
        <section className="panel">
          <h2>Mock Chat</h2>
          <p className="placeholder">(placeholder — simulation transcript, Phase 2)</p>
        </section>
      </main>
    </div>
  );
}
