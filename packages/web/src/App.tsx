import { useCallback, useEffect, useRef, useState } from 'react';
import type { Severity } from 'shared';

import {
  ApiError,
  explainFlow,
  generateFlow,
  resetSession,
  reviewFlow,
  startSession,
  stepSession,
  type SessionEnvelope,
} from './api.js';
import { BrandMark } from './components/BrandMark.js';
import { Stepper, type StepperStep } from './components/Stepper.js';
import { ChatPanel } from './panels/ChatPanel.js';
import { FlowPanel } from './panels/FlowPanel.js';
import { PromptPanel } from './panels/PromptPanel.js';
import type {
  AppErrorSummary,
  AppStatus,
  ExplainStatus,
  ReviewStatus,
  SimulationStatus,
} from './state.js';

/* ---------- Recent-prompts persistence ---------- */

const RECENT_PROMPTS_KEY = 'wati.recentPrompts';
const RECENT_PROMPTS_MAX = 5;

/**
 * Defensive localStorage reader for the recent-prompts list.
 * Tolerates malformed payloads (returns []) and clamps to the max length.
 */
function readStoredRecentPrompts(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(RECENT_PROMPTS_KEY);
    if (raw === null) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((v): v is string => typeof v === 'string' && v.trim().length > 0)
      .slice(0, RECENT_PROMPTS_MAX);
  } catch {
    return [];
  }
}

function writeStoredRecentPrompts(list: ReadonlyArray<string>): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(RECENT_PROMPTS_KEY, JSON.stringify(list));
  } catch {
    /* quota / disabled storage — best effort only */
  }
}

/**
 * Derives the 3-step workflow indicator from the two lifecycle slices that
 * actually drive it: flow generation status and chat-widget visibility.
 *
 *   idle / generating / error → step 1 is the user's job
 *   ready, widget closed      → step 2 ("inspect the Flow") is up
 *   ready, widget open        → step 3 ("Test Chatbot") is up
 *
 * Kept as a pure function so we can pin it with a focused unit test if
 * we ever expand the state machine.
 */
export function deriveWorkflowSteps(status: AppStatus, simOpen: boolean): StepperStep[] {
  const ready = status.kind === 'ready';
  if (ready && simOpen) {
    return [
      { label: 'Describe', state: 'done' },
      { label: 'Flow', state: 'done' },
      { label: 'Test', state: 'active' },
    ];
  }
  if (ready) {
    return [
      { label: 'Describe', state: 'done' },
      { label: 'Flow', state: 'active' },
      { label: 'Test', state: 'pending' },
    ];
  }
  return [
    { label: 'Describe', state: 'active' },
    { label: 'Flow', state: 'pending' },
    { label: 'Test', state: 'pending' },
  ];
}

export function App() {
  const [prompt, setPrompt] = useState('');
  const [status, setStatus] = useState<AppStatus>({ kind: 'idle' });
  const [simStatus, setSimStatus] = useState<SimulationStatus>({ kind: 'inactive' });
  // Whether the floating chat widget is visible. Decoupled from `simStatus`
  // so that closing the widget keeps the session alive for resumption.
  // The session itself is started lazily on first open of the widget.
  const [simOpen, setSimOpen] = useState(false);
  const [explainStatus, setExplainStatus] = useState<ExplainStatus>({ kind: 'idle' });
  const [reviewStatus, setReviewStatus] = useState<ReviewStatus>({ kind: 'idle' });
  // Index of the currently selected issue card. Drives graph highlighting.
  // Null = nothing selected, which is the default and the post-regenerate state.
  const [selectedIssueIndex, setSelectedIssueIndex] = useState<number | null>(null);
  // Recent prompts surfaced in the Prompt panel for one-click reuse.
  // Hydrated from localStorage on mount so they survive reloads — failed
  // generations are recorded too, so the user can edit and retry.
  const [recentPrompts, setRecentPrompts] = useState<string[]>(() => readStoredRecentPrompts());
  const generateAbortRef = useRef<AbortController | null>(null);
  const simAbortRef = useRef<AbortController | null>(null);
  const explainAbortRef = useRef<AbortController | null>(null);
  const reviewAbortRef = useRef<AbortController | null>(null);
  // Mirror of simStatus, so step/reset handlers can read the current sessionId
  // without depending on it (which would re-create the callbacks on every keystroke).
  const simStatusRef = useRef<SimulationStatus>(simStatus);
  useEffect(() => {
    simStatusRef.current = simStatus;
  }, [simStatus]);
  // Same pattern for explainStatus: handleExplain reads the previous explanation
  // so it can stay visible during a refresh.
  const explainStatusRef = useRef<ExplainStatus>(explainStatus);
  useEffect(() => {
    explainStatusRef.current = explainStatus;
  }, [explainStatus]);

  // Abort any in-flight network on unmount, for all lifecycles.
  useEffect(
    () => () => {
      generateAbortRef.current?.abort();
      simAbortRef.current?.abort();
      explainAbortRef.current?.abort();
      reviewAbortRef.current?.abort();
    },
    [],
  );

  const handleSubmit = useCallback(async () => {
    const trimmed = prompt.trim();
    if (!trimmed) return;
    generateAbortRef.current?.abort();
    simAbortRef.current?.abort();
    explainAbortRef.current?.abort();
    reviewAbortRef.current?.abort();
    const controller = new AbortController();
    generateAbortRef.current = controller;
    setStatus({ kind: 'generating' });
    // Regenerating throws away whatever session was running and force-closes
    // the floating chat widget. The next "Test Chatbot" click starts fresh
    // against the new flow.
    setSimStatus({ kind: 'inactive' });
    setSimOpen(false);
    setExplainStatus({ kind: 'idle' });
    setReviewStatus({ kind: 'idle' });
    setSelectedIssueIndex(null);
    // Record the submitted prompt to history immediately (before the LLM
    // call resolves). This way the user can recover their last prompt even
    // if generation fails — exactly the moment they're most likely to want
    // to tweak and retry.
    setRecentPrompts((prev) => {
      const deduped = [trimmed, ...prev.filter((p) => p !== trimmed)].slice(0, RECENT_PROMPTS_MAX);
      writeStoredRecentPrompts(deduped);
      return deduped;
    });
    try {
      const flow = await generateFlow(prompt, controller.signal);
      if (controller.signal.aborted) return;
      setStatus({ kind: 'ready', flow });
    } catch (err) {
      if (controller.signal.aborted) return;
      setStatus({ kind: 'error', error: summariseError(err) });
    }
  }, [prompt]);

  const handleUseRecent = useCallback((next: string) => {
    setPrompt(next);
  }, []);

  /**
   * Open the chat widget. Lazily starts a session the first time it's
   * opened against a given flow — if one is already running, just shows
   * the widget. Closing the widget never aborts the session.
   */
  const handleOpenChatbot = useCallback(() => {
    if (status.kind !== 'ready') return;
    setSimOpen(true);
    const current = simStatusRef.current;
    if (current.kind === 'active' || current.kind === 'starting') return;
    const fid = status.flow.id;
    simAbortRef.current?.abort();
    const controller = new AbortController();
    simAbortRef.current = controller;
    setSimStatus({ kind: 'starting' });
    void (async () => {
      try {
        const envelope = await startSession(fid, controller.signal);
        if (controller.signal.aborted) return;
        setSimStatus({ kind: 'active', envelope });
      } catch (err) {
        if (controller.signal.aborted) return;
        setSimStatus({ kind: 'error', error: summariseError(err) });
      }
    })();
  }, [status]);

  const handleCloseChatbot = useCallback(() => {
    // Intentionally does NOT reset simStatus or abort the running session —
    // the user may close the widget to look at the graph and re-open later
    // mid-conversation.
    setSimOpen(false);
  }, []);

  const handleStep = useCallback(async (message: string) => {
    const current = simStatusRef.current;
    if (current.kind !== 'active') return;
    const sessionId = current.envelope.session.id;

    setSimStatus((s) =>
      s.kind === 'active' ? { ...s, pending: 'step', lastError: undefined } : s,
    );
    simAbortRef.current?.abort();
    const controller = new AbortController();
    simAbortRef.current = controller;
    try {
      const envelope = await stepSession(sessionId, message, controller.signal);
      if (controller.signal.aborted) return;
      setSimStatus({ kind: 'active', envelope });
    } catch (err) {
      if (controller.signal.aborted) return;
      // Keep the transcript visible: fold the failure into the active state
      // as `lastError` instead of collapsing the whole panel. The next
      // successful step / reset clears the banner.
      setSimStatus((s) =>
        s.kind === 'active'
          ? { ...s, pending: undefined, lastError: summariseError(err) }
          : { kind: 'error', error: summariseError(err) },
      );
    }
  }, []);

  const handleReset = useCallback(async () => {
    const current = simStatusRef.current;
    if (current.kind !== 'active') return;
    const sessionId = current.envelope.session.id;

    setSimStatus((s) =>
      s.kind === 'active' ? { ...s, pending: 'reset', lastError: undefined } : s,
    );
    simAbortRef.current?.abort();
    const controller = new AbortController();
    simAbortRef.current = controller;
    try {
      const envelope = await resetSession(sessionId, controller.signal);
      if (controller.signal.aborted) return;
      setSimStatus({ kind: 'active', envelope });
    } catch (err) {
      if (controller.signal.aborted) return;
      setSimStatus((s) =>
        s.kind === 'active'
          ? { ...s, pending: undefined, lastError: summariseError(err) }
          : { kind: 'error', error: summariseError(err) },
      );
    }
  }, []);

  const handleExplain = useCallback(async () => {
    if (status.kind !== 'ready') return;
    const fid = status.flow.id;

    // Keep the previous explanation visible if there is one (refresh UX); otherwise
    // show the loading placeholder. Either way, abort any prior in-flight request.
    explainAbortRef.current?.abort();
    // Explain and Review are mutually exclusive in the UI; opening Explain
    // closes any active Review.
    reviewAbortRef.current?.abort();
    setReviewStatus({ kind: 'idle' });

    const prev = explainStatusRef.current;
    if (prev.kind === 'ready') {
      setExplainStatus({ kind: 'ready', explanation: prev.explanation, refreshing: true });
    } else {
      setExplainStatus({ kind: 'loading' });
    }

    const controller = new AbortController();
    explainAbortRef.current = controller;
    try {
      const explanation = await explainFlow(fid, controller.signal);
      if (controller.signal.aborted) return;
      setExplainStatus({ kind: 'ready', explanation });
    } catch (err) {
      if (controller.signal.aborted) return;
      setExplainStatus({ kind: 'error', error: summariseError(err) });
    }
  }, [status]);

  const handleCloseExplain = useCallback(() => {
    explainAbortRef.current?.abort();
    setExplainStatus({ kind: 'idle' });
  }, []);

  const handleReview = useCallback(async () => {
    if (status.kind !== 'ready') return;
    const fid = status.flow.id;

    // Mutex with Explain.
    explainAbortRef.current?.abort();
    setExplainStatus({ kind: 'idle' });

    // "Blank then loading": always clear the previous result when the user
    // re-triggers a review. No refreshing-overlay UX here.
    reviewAbortRef.current?.abort();
    setReviewStatus({ kind: 'loading' });
    // A new review run invalidates whatever was previously selected.
    setSelectedIssueIndex(null);

    const controller = new AbortController();
    reviewAbortRef.current = controller;
    try {
      const result = await reviewFlow(fid, controller.signal);
      if (controller.signal.aborted) return;
      setReviewStatus({ kind: 'ready', result });
    } catch (err) {
      if (controller.signal.aborted) return;
      setReviewStatus({ kind: 'error', error: summariseError(err) });
    }
  }, [status]);

  const handleCloseReview = useCallback(() => {
    reviewAbortRef.current?.abort();
    setReviewStatus({ kind: 'idle' });
    setSelectedIssueIndex(null);
  }, []);

  // Derive the highlighted nodes + glow severity from review status +
  // selection. Recompute on every render — cheap, and avoids a second source
  // of truth for "which nodes are highlighted".
  let selectedNodeIds: string[] = [];
  let selectedSeverity: Severity | undefined;
  if (reviewStatus.kind === 'ready' && selectedIssueIndex !== null) {
    const issue = reviewStatus.result.issues[selectedIssueIndex];
    if (issue) {
      selectedNodeIds = issue.nodeIds;
      selectedSeverity = issue.severity;
    }
  }

  const workflowSteps = deriveWorkflowSteps(status, simOpen);

  return (
    <div className="app">
      <header className="header">
        <div className="brand">
          <BrandMark />
          <div className="brand-text">
            <h1>Wati Automation Builder Copilot</h1>
            <p className="brand-tagline">Plain English → WhatsApp automation flow</p>
          </div>
        </div>
        <Stepper steps={workflowSteps} />
      </header>
      <main className="panels">
        <PromptPanel
          prompt={prompt}
          onPromptChange={setPrompt}
          onSubmit={handleSubmit}
          isGenerating={status.kind === 'generating'}
          recentPrompts={recentPrompts}
          onUseRecent={handleUseRecent}
        />
        <FlowPanel
          status={status}
          explainStatus={explainStatus}
          reviewStatus={reviewStatus}
          onExplain={handleExplain}
          onCloseExplain={handleCloseExplain}
          onReview={handleReview}
          onCloseReview={handleCloseReview}
          selectedNodeIds={selectedNodeIds}
          {...(selectedSeverity !== undefined ? { selectedSeverity } : {})}
          selectedIssueIndex={selectedIssueIndex}
          onSelectIssue={setSelectedIssueIndex}
          onOpenChatbot={handleOpenChatbot}
          chatWidget={
            simOpen ? (
              <ChatPanel
                status={simStatus}
                onStep={handleStep}
                onReset={handleReset}
                onClose={handleCloseChatbot}
                {...(status.kind === 'ready' ? { flow: status.flow } : {})}
              />
            ) : null
          }
        />
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
