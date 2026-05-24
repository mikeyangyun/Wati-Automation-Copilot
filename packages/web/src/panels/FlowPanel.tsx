import {
  Suspense,
  lazy,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react';
import type { Severity } from 'shared';

import { IssueList } from '../components/IssueList.js';
import { SAMPLE_FLOW } from '../graph/sampleFlow.js';
import type { AppStatus, ExplainStatus, ReviewStatus } from '../state.js';

/* ---------- Chat widget sizing ---------- */

const WIDGET_STORAGE_KEY = 'wati.chatWidgetSize';
const WIDGET_DEFAULT_WIDTH = 360;
const WIDGET_DEFAULT_HEIGHT = 560;
const WIDGET_MIN_WIDTH = 320;
const WIDGET_MIN_HEIGHT = 360;

interface WidgetSize {
  width: number;
  height: number;
}

/**
 * Reads the persisted widget size from localStorage with defensive parsing —
 * malformed JSON or out-of-range numbers fall back to defaults. SSR-safe
 * (returns defaults when `window` is undefined).
 */
function readStoredWidgetSize(): WidgetSize {
  if (typeof window === 'undefined') {
    return { width: WIDGET_DEFAULT_WIDTH, height: WIDGET_DEFAULT_HEIGHT };
  }
  try {
    const raw = window.localStorage.getItem(WIDGET_STORAGE_KEY);
    if (raw === null) {
      return { width: WIDGET_DEFAULT_WIDTH, height: WIDGET_DEFAULT_HEIGHT };
    }
    const parsed: unknown = JSON.parse(raw);
    if (
      parsed !== null &&
      typeof parsed === 'object' &&
      'width' in parsed &&
      'height' in parsed &&
      typeof (parsed as { width: unknown }).width === 'number' &&
      typeof (parsed as { height: unknown }).height === 'number'
    ) {
      const { width, height } = parsed as WidgetSize;
      return {
        width: Math.max(WIDGET_MIN_WIDTH, width),
        height: Math.max(WIDGET_MIN_HEIGHT, height),
      };
    }
  } catch {
    /* corrupt entry — fall through to defaults */
  }
  return { width: WIDGET_DEFAULT_WIDTH, height: WIDGET_DEFAULT_HEIGHT };
}

function writeStoredWidgetSize(size: WidgetSize): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(WIDGET_STORAGE_KEY, JSON.stringify(size));
  } catch {
    /* quota / disabled storage — best effort only */
  }
}

/*
 * Lazy-loaded to keep the initial render snappy. Both are wrapped in
 * `<Suspense>` so first paint never blocks on these chunks:
 *   - `FlowGraph` pulls in `@xyflow/react` + `@dagrejs/dagre` (~150 KB gz).
 *     It also renders the idle-state sample preview, so this chunk now
 *     loads shortly after first paint rather than after the first
 *     Generate. The Suspense fallback covers the small download window.
 *   - `react-markdown` only renders when the Explain block is open.
 * Splitting them dropped the initial JS chunk from ~189 KB to ~85 KB gz.
 */
const FlowGraph = lazy(() =>
  import('../graph/FlowGraph.js').then((m) => ({ default: m.FlowGraph })),
);
const ReactMarkdown = lazy(() => import('react-markdown'));

type FlowView = 'graph' | 'json';

export interface FlowPanelProps {
  status: AppStatus;
  explainStatus: ExplainStatus;
  reviewStatus: ReviewStatus;
  onExplain: () => void;
  onCloseExplain: () => void;
  onReview: () => void;
  onCloseReview: () => void;
  /**
   * Node ids highlighted in the graph (typically the affected nodes of the
   * currently-selected review issue). Empty / undefined → no highlight.
   */
  selectedNodeIds?: string[];
  /** Severity of the currently selected issue — drives glow color. */
  selectedSeverity?: Severity;
  /** Index of the currently-selected issue card, or `null` when none. */
  selectedIssueIndex?: number | null;
  /** Fired when the user clicks an issue card. App owns the resulting state. */
  onSelectIssue?: (index: number | null) => void;
  /** Fires when the user clicks the "Test Chatbot" button in the header. */
  onOpenChatbot?: () => void;
  /**
   * Optional chat widget node. When provided (and the flow is ready), it's
   * rendered as a floating overlay anchored to the bottom-right of the flow
   * panel. App owns visibility — pass `null` to keep the widget closed.
   */
  chatWidget?: ReactNode;
}

export function FlowPanel({
  status,
  explainStatus,
  reviewStatus,
  onExplain,
  onCloseExplain,
  onReview,
  onCloseReview,
  selectedNodeIds,
  selectedSeverity,
  selectedIssueIndex,
  onSelectIssue,
  onOpenChatbot,
  chatWidget,
}: FlowPanelProps) {
  const flowReady = status.kind === 'ready';
  // The view toggle is presentation-only, so it lives in the panel rather
  // than bubbling all the way up to App. Graph is the default.
  const [view, setView] = useState<FlowView>('graph');
  const [widgetSize, setWidgetSize] = useState<WidgetSize>(readStoredWidgetSize);

  const isExplainLoading = explainStatus.kind === 'loading';
  const isExplainRefreshing = explainStatus.kind === 'ready' && explainStatus.refreshing === true;
  const explainBusy = isExplainLoading || isExplainRefreshing;
  const hasExplanation = explainStatus.kind === 'ready';
  const explainLabel = explainBusy
    ? 'Explaining…'
    : hasExplanation
      ? 'Refresh explanation'
      : 'Explain';

  const reviewBusy = reviewStatus.kind === 'loading';
  const hasReview = reviewStatus.kind === 'ready' || reviewStatus.kind === 'error';
  const reviewLabel = reviewBusy ? 'Reviewing…' : hasReview ? 'Refresh review' : 'Review';

  // Mutex: the active block is whichever lifecycle is non-idle. App keeps
  // them mutually exclusive, so this is a presentation choice, not a guard.
  const showExplain = explainStatus.kind !== 'idle';
  const showReview = !showExplain && reviewStatus.kind !== 'idle';

  // The Test Chatbot button is gated on a ready flow — opening the widget
  // without a flow would start a session against `null`.
  const testChatbotDisabled = !flowReady;
  const testChatbotTitle = testChatbotDisabled
    ? 'Generate a flow first to launch the test chatbot'
    : 'Open the test chatbot — try the flow as if you were the end-user';

  return (
    <section className="panel flow-panel">
      <header className="flow-header">
        <h2>Flow</h2>
        {flowReady && (
          <div className="flow-header-actions">
            <button
              type="button"
              className="flow-explain-btn"
              onClick={onExplain}
              disabled={explainBusy}
            >
              {explainLabel}
            </button>
            <button
              type="button"
              className="flow-review-btn"
              onClick={onReview}
              disabled={reviewBusy}
            >
              {reviewLabel}
            </button>
            <button
              type="button"
              className="flow-view-btn"
              onClick={() => setView(view === 'graph' ? 'json' : 'graph')}
              data-testid="flow-view-toggle"
            >
              {view === 'graph' ? 'View JSON' : 'View graph'}
            </button>
            {onOpenChatbot !== undefined && (
              <button
                type="button"
                className="flow-test-chatbot-btn"
                onClick={onOpenChatbot}
                disabled={testChatbotDisabled}
                title={testChatbotTitle}
                data-testid="flow-test-chatbot"
              >
                <span className="flow-test-chatbot-icon" aria-hidden="true">
                  ▶
                </span>
                Test Chatbot
              </button>
            )}
          </div>
        )}
      </header>
      {showExplain && <ExplanationBlock status={explainStatus} onClose={onCloseExplain} />}
      {showReview && (
        <ReviewBlock
          status={reviewStatus}
          onClose={onCloseReview}
          selectedIssueIndex={selectedIssueIndex ?? null}
          onSelectIssue={onSelectIssue}
        />
      )}
      <FlowPanelBody
        status={status}
        view={view}
        selectedNodeIds={selectedNodeIds}
        selectedSeverity={selectedSeverity}
      />
      {chatWidget !== null && chatWidget !== undefined && (
        <div
          className="chat-widget"
          data-testid="chat-widget"
          style={{ width: `${widgetSize.width}px`, height: `${widgetSize.height}px` }}
        >
          <ChatWidgetResizeHandle size={widgetSize} onResize={setWidgetSize} />
          {chatWidget}
        </div>
      )}
    </section>
  );
}

/**
 * Drag-from-top-left resize affordance for the chat widget. Pure pointer
 * tracking — we don't go through React state on every mousemove (would render
 * the parent on every pixel). Instead we set the widget's inline width/height
 * directly via the prop callback (cheap because only the widget div + handle
 * re-render), and persist to localStorage once on pointerup.
 */
function ChatWidgetResizeHandle({
  size,
  onResize,
}: {
  size: WidgetSize;
  onResize: (next: WidgetSize) => void;
}) {
  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    // Left-button only — middle / right clicks shouldn't start a resize.
    if (e.button !== 0) return;
    e.preventDefault();
    const startX = e.clientX;
    const startY = e.clientY;
    const startW = size.width;
    const startH = size.height;
    // Track the most recent committed size so we can persist exactly that on
    // pointerup — `size` from closure stays stale across moves otherwise.
    let lastW = startW;
    let lastH = startH;

    const maxW = Math.round(window.innerWidth * 0.85);
    const maxH = Math.round(window.innerHeight * 0.9);

    const onMove = (ev: PointerEvent) => {
      // The widget is anchored bottom-right. Dragging the top-left handle
      // toward the upper-left should grow it, so positive delta = startX - x.
      const dx = startX - ev.clientX;
      const dy = startY - ev.clientY;
      lastW = clamp(startW + dx, WIDGET_MIN_WIDTH, maxW);
      lastH = clamp(startH + dy, WIDGET_MIN_HEIGHT, maxH);
      onResize({ width: lastW, height: lastH });
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      writeStoredWidgetSize({ width: lastW, height: lastH });
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
  };

  return (
    <div
      className="chat-widget-resize-handle"
      data-testid="chat-widget-resize-handle"
      role="separator"
      aria-orientation="horizontal"
      aria-label="Resize chat widget"
      title="Drag to resize"
      onPointerDown={onPointerDown}
    >
      <span aria-hidden="true" className="chat-widget-resize-grip" />
    </div>
  );
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function ExplanationBlock({ status, onClose }: { status: ExplainStatus; onClose: () => void }) {
  if (status.kind === 'idle') return null;

  if (status.kind === 'loading') {
    return (
      <div className="flow-explanation flow-explanation-loading" data-testid="explanation-loading">
        Generating explanation…
      </div>
    );
  }

  if (status.kind === 'error') {
    return (
      <div className="flow-explanation-error" role="alert" data-testid="explanation-error">
        <strong>{status.error.code}</strong>
        <p>{status.error.message}</p>
      </div>
    );
  }

  // status.kind === 'ready'
  return (
    <div
      className={
        status.refreshing ? 'flow-explanation flow-explanation-refreshing' : 'flow-explanation'
      }
      data-testid="explanation"
    >
      <button
        type="button"
        className="flow-explanation-close"
        onClick={onClose}
        aria-label="Close explanation"
      >
        ×
      </button>
      <div className="flow-explanation-body">
        <Suspense fallback={<p>{status.explanation}</p>}>
          <ReactMarkdown>{status.explanation}</ReactMarkdown>
        </Suspense>
      </div>
    </div>
  );
}

interface ReviewBlockProps {
  status: ReviewStatus;
  onClose: () => void;
  selectedIssueIndex: number | null;
  onSelectIssue?: (index: number | null) => void;
}

function ReviewBlock({ status, onClose, selectedIssueIndex, onSelectIssue }: ReviewBlockProps) {
  if (status.kind === 'idle') return null;

  if (status.kind === 'loading') {
    return (
      <div className="flow-review flow-review-loading" data-testid="review-loading">
        Running review…
      </div>
    );
  }

  if (status.kind === 'error') {
    return (
      <div className="flow-review-error" role="alert" data-testid="review-error">
        <button
          type="button"
          className="flow-review-close"
          onClick={onClose}
          aria-label="Close review"
        >
          ×
        </button>
        <strong>{status.error.code}</strong>
        <p>{status.error.message}</p>
      </div>
    );
  }

  // status.kind === 'ready'
  return (
    <div className="flow-review" data-testid="review">
      <button
        type="button"
        className="flow-review-close"
        onClick={onClose}
        aria-label="Close review"
      >
        ×
      </button>
      <IssueList
        result={status.result}
        selectedIndex={selectedIssueIndex}
        {...(onSelectIssue ? { onSelect: onSelectIssue } : {})}
      />
    </div>
  );
}

interface FlowPanelBodyProps {
  status: AppStatus;
  view: FlowView;
  selectedNodeIds?: string[];
  selectedSeverity?: Severity;
}

function FlowPanelBody({ status, view, selectedNodeIds, selectedSeverity }: FlowPanelBodyProps) {
  switch (status.kind) {
    case 'idle':
      return <FlowPreview />;
    case 'generating':
      return <p className="placeholder">Generating flow…</p>;
    case 'ready':
      if (view === 'graph') {
        return (
          <Suspense
            fallback={
              <div className="flow-graph flow-graph-empty" data-testid="flow-graph-loading">
                Loading graph…
              </div>
            }
          >
            <FlowGraph
              flow={status.flow}
              {...(selectedNodeIds !== undefined ? { selectedNodeIds } : {})}
              {...(selectedSeverity !== undefined ? { selectedSeverity } : {})}
            />
          </Suspense>
        );
      }
      return (
        <pre className="flow-json" data-testid="flow-json">
          {JSON.stringify(status.flow, null, 2)}
        </pre>
      );
    case 'error':
      return (
        <div className="flow-error" role="alert">
          <strong>{status.error.code}</strong>
          <p>{status.error.message}</p>
        </div>
      );
  }
}

/**
 * Idle-state preview: a real (Zod-validated) sample flow rendered through
 * the same `<FlowGraph>` the user will see for their own generations, with
 * a clear "Example preview" banner so it's never mistaken for live output.
 *
 * The banner intentionally still contains the literal string "No flow yet"
 * so the existing accessibility / regression tests that anchor on that
 * copy keep passing — and so screen-reader users immediately understand
 * the state instead of being dropped into an unexplained graph.
 *
 * The `data-testid="flow-preview"` wrapper lets tests distinguish the
 * preview's graph from a real generated graph (they both use the
 * `flow-graph` testid, so we scope queries by walking up from this node
 * when needed).
 */
function FlowPreview() {
  return (
    <div className="flow-preview" data-testid="flow-preview">
      <div className="flow-preview-banner" role="note">
        <span className="flow-preview-eyebrow">Example preview</span>
        <p className="flow-preview-heading">No flow yet — here&apos;s what one looks like.</p>
        <p className="flow-preview-caption">
          Enter a prompt and click Generate (or press ⌘+Enter). Your flow lands here, ready to
          explain, review, and test.
        </p>
      </div>
      <Suspense
        fallback={
          <div className="flow-graph flow-graph-empty" data-testid="flow-preview-loading">
            Loading preview…
          </div>
        }
      >
        <FlowGraph flow={SAMPLE_FLOW} />
      </Suspense>
    </div>
  );
}
