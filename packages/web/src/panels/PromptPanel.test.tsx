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
});
