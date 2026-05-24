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
    icon: '🛒',
    title: 'Buyer / Seller routing',
    summary: 'Branch new contacts to sales or support based on who they are.',
    prompt:
      'When a new contact messages us, ask if they are a buyer or seller. Route buyers to the sales team and sellers to support.',
  },
  {
    icon: '💬',
    title: 'Support keyword handoff',
    summary: 'Triggered by the word "support", collect intent and assign a team.',
    prompt:
      'When someone sends "support", ask what they need help with, then assign the chat to the support team.',
  },
  {
    icon: '🔗',
    title: 'Lead capture via API',
    summary: 'Ask for an email, then POST it to a downstream system.',
    prompt:
      'When a contact messages, ask for their email address, then save it via an API call to https://example.com/leads.',
  },
];

const PROMPT_SOFT_LIMIT = 400;

export interface PromptPanelProps {
  prompt: string;
  onPromptChange: (next: string) => void;
  onSubmit: () => void;
  isGenerating: boolean;
}

export function PromptPanel({ prompt, onPromptChange, onSubmit, isGenerating }: PromptPanelProps) {
  const trimmedLen = prompt.trim().length;
  const canSubmit = trimmedLen > 0 && !isGenerating;
  const charCount = prompt.length;
  const overSoftLimit = charCount > PROMPT_SOFT_LIMIT;

  return (
    <section className="panel prompt-panel" aria-label="Prompt">
      <header className="prompt-header">
        <span className="prompt-eyebrow">Step 1 · Describe</span>
        <h2 className="prompt-title">What should the bot do?</h2>
        <p className="prompt-caption">
          Plain English is enough — the Copilot will turn it into a Wati flow.
        </p>
      </header>

      <div className={`prompt-field${isGenerating ? ' prompt-field-busy' : ''}`}>
        <textarea
          value={prompt}
          onChange={(e) => onPromptChange(e.target.value)}
          placeholder="e.g. When a new contact messages, ask if they are a buyer or seller, then route to the right team…"
          rows={6}
          aria-label="prompt input"
          disabled={isGenerating}
          className="prompt-textarea"
          maxLength={PROMPT_SOFT_LIMIT * 4}
        />
        <div
          className={`prompt-charcount${overSoftLimit ? ' prompt-charcount-warn' : ''}`}
          aria-live="polite"
        >
          {charCount}
          {overSoftLimit ? ` · long prompts may regenerate slowly` : ''}
        </div>
      </div>

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
