const STARTER_PROMPTS: ReadonlyArray<string> = [
  'When a new contact messages us, ask if they are a buyer or seller. Route buyers to the sales team and sellers to support.',
  'When someone sends "support", ask what they need help with, then assign the chat to the support team.',
  'When a contact messages, ask for their email address, then save it via an API call to https://example.com/leads.',
];

const STARTER_PREVIEW_MAX = 70;

export interface PromptPanelProps {
  prompt: string;
  onPromptChange: (next: string) => void;
  onSubmit: () => void;
  isGenerating: boolean;
}

export function PromptPanel({ prompt, onPromptChange, onSubmit, isGenerating }: PromptPanelProps) {
  const canSubmit = prompt.trim().length > 0 && !isGenerating;

  return (
    <section className="panel">
      <h2>Prompt</h2>
      <textarea
        value={prompt}
        onChange={(e) => onPromptChange(e.target.value)}
        placeholder="Describe the automation in plain English…"
        rows={6}
        aria-label="prompt input"
        disabled={isGenerating}
        className="prompt-textarea"
      />
      <div className="prompt-actions">
        <button type="button" onClick={onSubmit} disabled={!canSubmit} className="prompt-submit">
          {isGenerating ? 'Generating…' : 'Generate'}
        </button>
      </div>
      <div className="prompt-starters">
        <p className="starters-label">Starter prompts:</p>
        <ul>
          {STARTER_PROMPTS.map((p) => (
            <li key={p}>
              <button
                type="button"
                onClick={() => onPromptChange(p)}
                disabled={isGenerating}
                data-testid="starter-prompt"
                className="starter-button"
                title={p}
              >
                {p.length > STARTER_PREVIEW_MAX ? `${p.slice(0, STARTER_PREVIEW_MAX)}…` : p}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
