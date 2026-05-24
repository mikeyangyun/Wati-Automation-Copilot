// @vitest-environment happy-dom
import '@testing-library/jest-dom/vitest';

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { PromptPanel } from './PromptPanel.js';

describe('PromptPanel', () => {
  it('renders a textarea bound to the prompt prop and a Generate button', () => {
    render(
      <PromptPanel
        prompt="hello"
        onPromptChange={() => {}}
        onSubmit={() => {}}
        isGenerating={false}
      />,
    );
    const textarea = screen.getByLabelText(/prompt input/i) as HTMLTextAreaElement;
    expect(textarea).toBeInTheDocument();
    expect(textarea.value).toBe('hello');
    expect(screen.getByRole('button', { name: /generate/i })).toBeEnabled();
  });

  it('disables the Generate button when the prompt is blank', () => {
    render(
      <PromptPanel prompt="" onPromptChange={() => {}} onSubmit={() => {}} isGenerating={false} />,
    );
    expect(screen.getByRole('button', { name: /generate/i })).toBeDisabled();
  });

  it('disables the Generate button while a generation is in flight', () => {
    render(
      <PromptPanel
        prompt="some prompt"
        onPromptChange={() => {}}
        onSubmit={() => {}}
        isGenerating
      />,
    );
    expect(screen.getByRole('button', { name: /generating/i })).toBeDisabled();
  });

  it('calls onPromptChange when the user types', async () => {
    const onPromptChange = vi.fn();
    const user = userEvent.setup();
    render(
      <PromptPanel
        prompt=""
        onPromptChange={onPromptChange}
        onSubmit={() => {}}
        isGenerating={false}
      />,
    );
    await user.type(screen.getByLabelText(/prompt input/i), 'a');
    expect(onPromptChange).toHaveBeenCalledWith('a');
  });

  it('calls onSubmit when Generate is clicked', async () => {
    const onSubmit = vi.fn();
    const user = userEvent.setup();
    render(
      <PromptPanel
        prompt="hi"
        onPromptChange={() => {}}
        onSubmit={onSubmit}
        isGenerating={false}
      />,
    );
    await user.click(screen.getByRole('button', { name: /generate/i }));
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it('clicking a starter fills the prompt via onPromptChange', async () => {
    const onPromptChange = vi.fn();
    const user = userEvent.setup();
    render(
      <PromptPanel
        prompt=""
        onPromptChange={onPromptChange}
        onSubmit={() => {}}
        isGenerating={false}
      />,
    );
    const starters = screen.getAllByTestId('starter-prompt');
    expect(starters.length).toBeGreaterThan(0);
    await user.click(starters[0]!);
    expect(onPromptChange).toHaveBeenCalledTimes(1);
    expect(typeof onPromptChange.mock.calls[0]![0]).toBe('string');
    expect((onPromptChange.mock.calls[0]![0] as string).length).toBeGreaterThan(0);
  });

  it('renders structured starters with a visible title for each card', () => {
    render(
      <PromptPanel prompt="" onPromptChange={() => {}} onSubmit={() => {}} isGenerating={false} />,
    );
    const starters = screen.getAllByTestId('starter-prompt');
    // Each card must surface a human-readable title (not just the raw prompt
    // text), which is what makes the redesigned panel scannable.
    for (const starter of starters) {
      const title = starter.querySelector('.starter-title');
      expect(title).not.toBeNull();
      expect((title!.textContent ?? '').trim().length).toBeGreaterThan(0);
    }
  });

  it('starter title attribute carries the full prompt so it is recoverable on hover', () => {
    render(
      <PromptPanel prompt="" onPromptChange={() => {}} onSubmit={() => {}} isGenerating={false} />,
    );
    const starters = screen.getAllByTestId('starter-prompt');
    for (const starter of starters) {
      expect(starter.getAttribute('title')).toBeTruthy();
      expect((starter.getAttribute('title') ?? '').length).toBeGreaterThan(10);
    }
  });

  it('shows a live character count reflecting the prompt length', () => {
    const { rerender } = render(
      <PromptPanel
        prompt="hello"
        onPromptChange={() => {}}
        onSubmit={() => {}}
        isGenerating={false}
      />,
    );
    // The count is the only element whose text starts with the numeric length;
    // we scope by class to avoid colliding with bubble timestamps elsewhere.
    const count = document.querySelector('.prompt-charcount');
    expect(count).not.toBeNull();
    expect(count!.textContent).toContain('5');

    rerender(
      <PromptPanel
        prompt="hello world"
        onPromptChange={() => {}}
        onSubmit={() => {}}
        isGenerating={false}
      />,
    );
    expect(document.querySelector('.prompt-charcount')!.textContent).toContain('11');
  });

  it('marks the field as busy while a generation is in flight', () => {
    const { container } = render(
      <PromptPanel
        prompt="some prompt"
        onPromptChange={() => {}}
        onSubmit={() => {}}
        isGenerating
      />,
    );
    // The busy class is what dims the field + textarea while the LLM runs.
    expect(container.querySelector('.prompt-field-busy')).not.toBeNull();
  });

  it('does not render the old "Step 1 · Describe" eyebrow', () => {
    const { container } = render(
      <PromptPanel prompt="" onPromptChange={() => {}} onSubmit={() => {}} isGenerating={false} />,
    );
    // The step concept moved to the global stepper in the app header.
    // Pinning the absence here prevents an accidental revival of the
    // confusing "where's Step 2?" eyebrow inside this panel.
    expect(container.querySelector('.prompt-eyebrow')).toBeNull();
    expect(screen.queryByText(/step 1/i)).toBeNull();
  });
});

describe('PromptPanel — keyboard shortcut', () => {
  it('triggers onSubmit when the user presses ⌘+Enter inside the textarea', async () => {
    const onSubmit = vi.fn();
    const user = userEvent.setup();
    render(
      <PromptPanel
        prompt="ready"
        onPromptChange={() => {}}
        onSubmit={onSubmit}
        isGenerating={false}
      />,
    );
    const textarea = screen.getByLabelText(/prompt input/i);
    textarea.focus();
    await user.keyboard('{Meta>}{Enter}{/Meta}');
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it('also accepts Ctrl+Enter so the shortcut works on non-Mac platforms', async () => {
    const onSubmit = vi.fn();
    const user = userEvent.setup();
    render(
      <PromptPanel
        prompt="ready"
        onPromptChange={() => {}}
        onSubmit={onSubmit}
        isGenerating={false}
      />,
    );
    const textarea = screen.getByLabelText(/prompt input/i);
    textarea.focus();
    await user.keyboard('{Control>}{Enter}{/Control}');
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it('plain Enter inserts a newline and does NOT submit', async () => {
    const onSubmit = vi.fn();
    const onPromptChange = vi.fn();
    const user = userEvent.setup();
    render(
      <PromptPanel
        prompt="ready"
        onPromptChange={onPromptChange}
        onSubmit={onSubmit}
        isGenerating={false}
      />,
    );
    const textarea = screen.getByLabelText(/prompt input/i);
    textarea.focus();
    await user.keyboard('{Enter}');
    // We don't actually assert against onPromptChange here (the textarea is
    // controlled by the parent, which we mock as a no-op); the key assertion
    // is that submit was NOT triggered, since multi-line editing must be
    // preserved.
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('does not submit via shortcut when the prompt is blank', async () => {
    const onSubmit = vi.fn();
    const user = userEvent.setup();
    render(
      <PromptPanel prompt="" onPromptChange={() => {}} onSubmit={onSubmit} isGenerating={false} />,
    );
    const textarea = screen.getByLabelText(/prompt input/i);
    textarea.focus();
    await user.keyboard('{Meta>}{Enter}{/Meta}');
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('does not submit via shortcut while a generation is already in flight', async () => {
    const onSubmit = vi.fn();
    const user = userEvent.setup();
    render(
      <PromptPanel prompt="ready" onPromptChange={() => {}} onSubmit={onSubmit} isGenerating />,
    );
    // The textarea is disabled when generating — focus the panel and fire
    // the keydown directly via fireEvent-style userEvent on the document.
    // Even with a global keydown the handler would no-op because canSubmit
    // is false.
    await user.keyboard('{Meta>}{Enter}{/Meta}');
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('renders an inline ⌘+Enter hint next to the Generate button', () => {
    const { container } = render(
      <PromptPanel prompt="" onPromptChange={() => {}} onSubmit={() => {}} isGenerating={false} />,
    );
    const inline = container.querySelector('.prompt-shortcut-inline');
    expect(inline).not.toBeNull();
    // The hint surfaces both the ⌘ and Enter chips so users see the shortcut
    // at the exact moment they're about to click Generate.
    const keys = inline!.querySelectorAll('kbd');
    expect(keys.length).toBeGreaterThanOrEqual(2);
  });

  it('renders a bottom shortcut footer with the keyboard hint', () => {
    const { container } = render(
      <PromptPanel prompt="" onPromptChange={() => {}} onSubmit={() => {}} isGenerating={false} />,
    );
    const footer = container.querySelector('.prompt-shortcut-hint');
    expect(footer).not.toBeNull();
    expect(footer!.querySelectorAll('kbd').length).toBeGreaterThanOrEqual(2);
    expect(footer!.textContent).toMatch(/generate/i);
  });
});

describe('PromptPanel — recent prompts', () => {
  it('does not render the Recent section when there is no history', () => {
    render(
      <PromptPanel
        prompt=""
        onPromptChange={() => {}}
        onSubmit={() => {}}
        isGenerating={false}
        recentPrompts={[]}
        onUseRecent={() => {}}
      />,
    );
    // No history → no clutter. Critical for the empty initial state.
    expect(screen.queryByLabelText(/recent prompts/i)).toBeNull();
    expect(screen.queryAllByTestId('recent-prompt')).toHaveLength(0);
  });

  it('renders one item per recent prompt, newest-first as passed', () => {
    render(
      <PromptPanel
        prompt=""
        onPromptChange={() => {}}
        onSubmit={() => {}}
        isGenerating={false}
        recentPrompts={['First prompt the user tried', 'A second, older prompt']}
        onUseRecent={() => {}}
      />,
    );
    const items = screen.getAllByTestId('recent-prompt');
    expect(items).toHaveLength(2);
    // Order matches the prop order — caller controls ordering (we don't
    // re-sort here, which keeps the component pure).
    expect(items[0]!.textContent).toContain('First prompt the user tried');
    expect(items[1]!.textContent).toContain('A second, older prompt');
  });

  it('calls onUseRecent with the full prompt when an item is clicked', async () => {
    const onUseRecent = vi.fn();
    const user = userEvent.setup();
    render(
      <PromptPanel
        prompt=""
        onPromptChange={() => {}}
        onSubmit={() => {}}
        isGenerating={false}
        recentPrompts={['Greet new contacts and ask their name.']}
        onUseRecent={onUseRecent}
      />,
    );
    await user.click(screen.getByTestId('recent-prompt'));
    expect(onUseRecent).toHaveBeenCalledWith('Greet new contacts and ask their name.');
  });

  it('hides the recent entry that matches the currently-edited prompt', () => {
    // Otherwise the very thing the user just typed shows up as a click
    // target right below the textarea, which is noisy and easy to misclick.
    render(
      <PromptPanel
        prompt="Greet new contacts"
        onPromptChange={() => {}}
        onSubmit={() => {}}
        isGenerating={false}
        recentPrompts={['Greet new contacts', 'Ask buyer or seller']}
        onUseRecent={() => {}}
      />,
    );
    const items = screen.getAllByTestId('recent-prompt');
    expect(items).toHaveLength(1);
    expect(items[0]!.textContent).toContain('Ask buyer or seller');
  });

  it('truncates very long prompts in the preview but keeps the full text on hover', () => {
    const long =
      'When a contact messages, ask them about pizza pasta salads drinks and then continue with sub-options for each and then assign to a team afterward including the address';
    render(
      <PromptPanel
        prompt=""
        onPromptChange={() => {}}
        onSubmit={() => {}}
        isGenerating={false}
        recentPrompts={[long]}
        onUseRecent={() => {}}
      />,
    );
    const item = screen.getByTestId('recent-prompt');
    expect(item.getAttribute('title')).toBe(long);
    const visible = item.querySelector('.recent-text');
    expect(visible).not.toBeNull();
    expect(visible!.textContent!.length).toBeLessThan(long.length);
    expect(visible!.textContent!.endsWith('…')).toBe(true);
  });

  it('does not render the Recent section when onUseRecent is omitted, even with history', () => {
    // A defensive contract — the section is interactive, so the parent must
    // opt in by providing the callback. Avoids dead buttons in callers that
    // only want the static panel.
    render(
      <PromptPanel
        prompt=""
        onPromptChange={() => {}}
        onSubmit={() => {}}
        isGenerating={false}
        recentPrompts={['Something old']}
      />,
    );
    expect(screen.queryByLabelText(/recent prompts/i)).toBeNull();
  });

  it('disables recent buttons while a generation is in flight', () => {
    render(
      <PromptPanel
        prompt="ready"
        onPromptChange={() => {}}
        onSubmit={() => {}}
        isGenerating
        recentPrompts={['Something old', 'Something newer']}
        onUseRecent={() => {}}
      />,
    );
    for (const item of screen.getAllByTestId('recent-prompt')) {
      expect(item).toBeDisabled();
    }
  });
});
