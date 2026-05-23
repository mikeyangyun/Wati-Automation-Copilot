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
});
