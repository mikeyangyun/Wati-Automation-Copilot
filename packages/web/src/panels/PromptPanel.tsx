import { useMemo, type KeyboardEvent as ReactKeyboardEvent } from 'react';

interface StarterPrompt {
  /** Emoji shown in the card chip. Single grapheme for layout stability. */
  icon: string;
  /** Short label for the card header — never truncated. */
  title: string;
  /** Two-line summary shown under the title, hard-clamped via CSS. */
  summary: string;
  /** Full prompt text injected into the textarea on click. */
  prompt: string;
}

const STARTERS: ReadonlyArray<StarterPrompt> = [
  {
    icon: '🍕',
    title: 'Restaurant ordering menu',
    summary: 'Pick a category, then a dish, then collect the address and post the order.',
    prompt:
      'When a contact messages, greet them and present these categories as a list: Pizza, Pasta, Salads, Drinks. Based on their choice, show 3 popular items in that category and ask which one they want. After they pick a dish, ask for their delivery address, confirm the order back to them, and POST the order details to https://example.com/orders.',
  },
  {
    icon: '🎧',
    title: 'Tiered support routing',
    summary: 'Department menu → sub-issue menu → assign the right team.',
    prompt:
      'When a contact sends "help", greet them and offer these departments as a list: Billing, Technical Support, Sales, General Inquiry. If they pick Billing, follow up with sub-options: Refund, Wrong charge, Subscription change, then assign to the billing team. If they pick Technical Support, follow up with: Login issue, Bug report, Feature question, then assign to the support team. Otherwise route to a human agent.',
  },
  {
    icon: '📅',
    title: 'Appointment booking',
    summary: 'Service → preferred day → time slot → save via API and confirm.',
    prompt:
      'When a contact wants to book, ask which service from this list: Haircut, Coloring, Treatment, Consultation. Then ask which day they prefer from: Monday, Tuesday, Wednesday, Thursday, Friday, Saturday. Then ask their preferred time slot from: Morning, Afternoon, Evening. Save the booking by calling https://example.com/bookings and reply with a confirmation message.',
  },
  {
    icon: '🛡️',
    title: 'Insurance quote intake',
    summary: 'Product type → vehicle/property subtype → age band → submit lead.',
    prompt:
      'When a contact messages, ask which insurance product they need from: Auto, Home, Health, Life. If they pick Auto, follow up with: Sedan, SUV, Truck, Motorcycle. If they pick Home, follow up with: House, Apartment, Condo. Then ask their age range from: 18-25, 26-40, 41-60, 60+. Finally save their details by POSTing to https://example.com/quotes and assign the chat to a sales agent.',
  },
];

const PROMPT_SOFT_LIMIT = 400;
const RECENT_PREVIEW_LEN = 70;

export interface PromptPanelProps {
  prompt: string;
  onPromptChange: (next: string) => void;
  onSubmit: () => void;
  isGenerating: boolean;
  /**
   * Optional list of previously-submitted prompts, newest-first. Rendered
   * as a "Recent" list below the starters so the user can recall and tweak
   * past attempts without retyping.
   */
  recentPrompts?: ReadonlyArray<string>;
  /**
   * Called with the selected recent prompt. Parent is expected to load it
   * into the textarea (typically by piping through `onPromptChange`).
   * Optional so the recent section silently hides when the parent does not
   * support it.
   */
  onUseRecent?: (prompt: string) => void;
}

export function PromptPanel({
  prompt,
  onPromptChange,
  onSubmit,
  isGenerating,
  recentPrompts,
  onUseRecent,
}: PromptPanelProps) {
  const trimmedLen = prompt.trim().length;
  const canSubmit = trimmedLen > 0 && !isGenerating;
  const charCount = prompt.length;
  const overSoftLimit = charCount > PROMPT_SOFT_LIMIT;

  // Hide whatever the user just typed from the Recent list — otherwise
  // the very prompt they're editing keeps appearing as a click target,
  // which is noisy and easy to misclick.
  const visibleRecents = useMemo(() => {
    if (!recentPrompts || !onUseRecent) return [];
    const currentTrim = prompt.trim();
    return recentPrompts.filter((p) => p !== currentTrim);
  }, [recentPrompts, onUseRecent, prompt]);

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLTextAreaElement>) => {
    // ⌘+Enter on macOS, Ctrl+Enter elsewhere. Both modifiers are accepted
    // so users don't need to think about platform conventions. The classic
    // newline behavior of plain Enter is preserved — the textarea is
    // multiline, and breaking lines is more common than submitting.
    if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      if (canSubmit) onSubmit();
    }
  };

  return (
    <section className="panel prompt-panel" aria-label="Prompt">
      <header className="prompt-header">
        <h2 className="prompt-title">What should the bot do?</h2>
        <p className="prompt-caption">
          Plain English is enough — the Copilot will turn it into a Wati flow.
        </p>
      </header>

      <div className={`prompt-field${isGenerating ? ' prompt-field-busy' : ''}`}>
        <textarea
          value={prompt}
          onChange={(e) => onPromptChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="e.g. When a contact messages, show a menu of Pizza / Pasta / Salads / Drinks, then ask for their pick…"
          rows={6}
          aria-label="prompt input"
          disabled={isGenerating}
          className="prompt-textarea"
          maxLength={PROMPT_SOFT_LIMIT * 4}
        />
        {/*
         * The counter is a compact, absolutely-positioned chip in the
         * textarea corner. Long warning text used to live inside it, but
         * for prompts that pushed over the soft limit the warning could
         * wrap and overlap the starter cards below. We now surface the
         * warning as a separate row beneath the field instead.
         */}
        <div
          className={`prompt-charcount${overSoftLimit ? ' prompt-charcount-warn' : ''}`}
          aria-live="polite"
        >
          {charCount}
        </div>
      </div>
      {overSoftLimit ? (
        <div className="prompt-charwarn" role="status" aria-live="polite">
          Long prompts may regenerate slowly.
        </div>
      ) : null}

      <div className="prompt-actions">
        <button
          type="button"
          onClick={onSubmit}
          disabled={!canSubmit}
          className="prompt-submit"
          data-testid="prompt-submit"
        >
          <span className="prompt-submit-icon" aria-hidden="true">
            {isGenerating ? <SubmitSpinner /> : '✨'}
          </span>
          <span className="prompt-submit-label">{isGenerating ? 'Generating…' : 'Generate'}</span>
        </button>
        <span className="prompt-shortcut-inline" aria-hidden="true">
          or press <kbd>⌘</kbd>
          <kbd>Enter</kbd>
        </span>
      </div>

      <div className="prompt-starters" aria-label="Starter prompts">
        <div className="prompt-starters-label">
          <span>Try one of these</span>
          <span className="prompt-starters-divider" aria-hidden="true" />
        </div>
        <ul className="prompt-starters-list">
          {STARTERS.map((starter) => (
            <li key={starter.title}>
              <button
                type="button"
                onClick={() => onPromptChange(starter.prompt)}
                disabled={isGenerating}
                data-testid="starter-prompt"
                className="starter-card"
                title={starter.prompt}
              >
                <span className="starter-icon" aria-hidden="true">
                  {starter.icon}
                </span>
                <span className="starter-text">
                  <span className="starter-title">{starter.title}</span>
                  <span className="starter-summary">{starter.summary}</span>
                </span>
                <span className="starter-arrow" aria-hidden="true">
                  →
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>

      {visibleRecents.length > 0 && onUseRecent ? (
        <div className="prompt-recents" aria-label="Recent prompts">
          <div className="prompt-recents-label">
            <span>Recent</span>
            <span className="prompt-recents-divider" aria-hidden="true" />
          </div>
          <ul className="prompt-recents-list">
            {visibleRecents.map((entry) => (
              <li key={entry}>
                <button
                  type="button"
                  onClick={() => onUseRecent(entry)}
                  disabled={isGenerating}
                  data-testid="recent-prompt"
                  className="recent-item"
                  title={entry}
                >
                  <span className="recent-icon" aria-hidden="true">
                    ↻
                  </span>
                  <span className="recent-text">{previewOf(entry)}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="prompt-shortcut-hint" role="note">
        <span className="prompt-shortcut-key">
          <kbd>⌘</kbd>
          <kbd>Enter</kbd>
        </span>
        <span>to generate</span>
      </div>
    </section>
  );
}

function SubmitSpinner() {
  // Three pulsing dots. Keeps the button at a stable width as the label
  // toggles between "Generate" and "Generating…".
  return (
    <span className="prompt-submit-dots">
      <span />
      <span />
      <span />
    </span>
  );
}

function previewOf(text: string): string {
  const oneLine = text.replace(/\s+/g, ' ').trim();
  return oneLine.length > RECENT_PREVIEW_LEN
    ? `${oneLine.slice(0, RECENT_PREVIEW_LEN - 1)}…`
    : oneLine;
}
