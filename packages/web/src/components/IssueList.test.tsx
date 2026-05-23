// @vitest-environment happy-dom
import '@testing-library/jest-dom/vitest';

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type { ReviewResult } from '../api.js';
import { IssueList } from './IssueList.js';

function buildResult(overrides: Partial<ReviewResult> = {}): ReviewResult {
  return {
    issues: [
      {
        severity: 'error',
        code: 'DANGLING_EDGE',
        message: 'Edge "e_bad" references a missing target.',
        nodeIds: ['n_ask'],
      },
      {
        severity: 'warning',
        code: 'MISSING_FALLBACK',
        message: '"Ask buyer/seller" has no fallback edge.',
        nodeIds: ['n_ask'],
      },
      {
        severity: 'info',
        code: 'UNCLEAR_QUESTION',
        message: 'The ask_question is compound.',
        nodeIds: ['n_ask'],
      },
    ],
    summary: '3 issues found (1 error, 1 warning, 1 info).',
    ...overrides,
  };
}

describe('IssueList — non-interactive rendering', () => {
  it('renders the summary + one row per issue when no onSelect is supplied', () => {
    render(<IssueList result={buildResult()} />);
    expect(screen.getByText('3 issues found (1 error, 1 warning, 1 info).')).toBeInTheDocument();
    expect(screen.getByTestId('issue-error')).toBeInTheDocument();
    expect(screen.getByTestId('issue-warning')).toBeInTheDocument();
    expect(screen.getByTestId('issue-info')).toBeInTheDocument();
  });

  it('renders the empty-state message when there are no issues', () => {
    render(<IssueList result={{ issues: [], summary: 'No issues found.' }} />);
    expect(screen.getByTestId('issue-list-empty')).toBeInTheDocument();
    expect(screen.getByText('No issues found.')).toBeInTheDocument();
  });

  it('does NOT wrap cards in a button when onSelect is omitted', () => {
    render(<IssueList result={buildResult()} />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});

describe('IssueList — selection (Phase 5)', () => {
  it('wraps every issue card in a button when onSelect is supplied', () => {
    render(<IssueList result={buildResult()} onSelect={vi.fn()} />);
    const buttons = screen.getAllByRole('button');
    expect(buttons).toHaveLength(3);
    for (const btn of buttons) {
      expect(btn).toHaveAttribute('aria-pressed', 'false');
    }
  });

  it('invokes onSelect with the clicked index when no row is yet selected', async () => {
    const onSelect = vi.fn();
    render(<IssueList result={buildResult()} onSelect={onSelect} />);
    const user = userEvent.setup();

    await user.click(screen.getAllByRole('button')[1]!);
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith(1);
  });

  it('invokes onSelect with null when clicking the already-selected card (toggle off)', async () => {
    const onSelect = vi.fn();
    render(<IssueList result={buildResult()} selectedIndex={1} onSelect={onSelect} />);
    const user = userEvent.setup();

    await user.click(screen.getAllByRole('button')[1]!);
    expect(onSelect).toHaveBeenCalledWith(null);
  });

  it('applies the selected class and aria-pressed to the active card only', () => {
    render(<IssueList result={buildResult()} selectedIndex={0} onSelect={vi.fn()} />);
    const errorRow = screen.getByTestId('issue-error');
    const warningRow = screen.getByTestId('issue-warning');
    expect(errorRow).toHaveClass('issue-selected');
    expect(warningRow).not.toHaveClass('issue-selected');

    const buttons = screen.getAllByRole('button');
    expect(buttons[0]).toHaveAttribute('aria-pressed', 'true');
    expect(buttons[1]).toHaveAttribute('aria-pressed', 'false');
  });

  it('still renders the empty-state and ignores onSelect when issues are empty', () => {
    render(<IssueList result={{ issues: [], summary: 'No issues found.' }} onSelect={vi.fn()} />);
    expect(screen.getByTestId('issue-list-empty')).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});
