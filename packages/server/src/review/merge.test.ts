import type { Issue } from 'shared';
import { describe, expect, it } from 'vitest';

import { mergeIssues, summarize } from './merge.js';

const structuralIssue = (overrides: Partial<Issue> = {}): Issue => ({
  severity: 'warning',
  code: 'MISSING_FALLBACK',
  message: '"Ask buyer/seller" has no fallback edge.',
  nodeIds: ['n_ask'],
  ...overrides,
});

const semanticIssue = (overrides: Partial<Issue> = {}): Issue => ({
  severity: 'warning',
  code: 'MISSING_BRANCH',
  message: 'No branch handles "renew subscription".',
  nodeIds: ['n_ask'],
  ...overrides,
});

describe('mergeIssues — dedup (BA decision #3)', () => {
  it('drops a semantic issue on a node already flagged by structural', () => {
    const result = mergeIssues([structuralIssue()], [semanticIssue()]);
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0]!.code).toBe('MISSING_FALLBACK');
  });

  it('keeps semantic issues that do not touch any structural-flagged node', () => {
    const structural = [structuralIssue({ nodeIds: ['n_ask'] })];
    const semantic = [semanticIssue({ nodeIds: ['n_other'] })];
    const result = mergeIssues(structural, semantic);
    expect(result.issues).toHaveLength(2);
  });

  it('keeps flow-level semantic issues (empty nodeIds) even when structural is non-empty', () => {
    const result = mergeIssues(
      [structuralIssue()],
      [semanticIssue({ nodeIds: [], message: 'Prompt mentions VIP but no node handles it.' })],
    );
    expect(result.issues).toHaveLength(2);
    expect(result.issues.find((i) => i.nodeIds.length === 0)).toBeDefined();
  });

  it('drops a semantic issue if ANY of its nodeIds is flagged structurally', () => {
    const semantic = [semanticIssue({ nodeIds: ['n_other', 'n_ask'] })];
    const result = mergeIssues([structuralIssue()], semantic);
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0]!.code).toBe('MISSING_FALLBACK');
  });

  it('passes structural issues through untouched even when semantic is empty', () => {
    const result = mergeIssues([structuralIssue()], []);
    expect(result.issues).toHaveLength(1);
  });

  it('passes semantic issues through untouched when structural is empty', () => {
    const result = mergeIssues([], [semanticIssue()]);
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0]!.code).toBe('MISSING_BRANCH');
  });
});

describe('mergeIssues — ordering', () => {
  it('sorts issues by severity descending (error → warning → info)', () => {
    const issues = [
      semanticIssue({ severity: 'info', code: 'UNCLEAR_QUESTION', nodeIds: ['n_x'] }),
      structuralIssue({ severity: 'warning', nodeIds: ['n_ask'] }),
      structuralIssue({ severity: 'error', code: 'MISSING_ENTRY', nodeIds: [] }),
    ];
    const result = mergeIssues(issues, []);
    expect(result.issues.map((i) => i.severity)).toEqual(['error', 'warning', 'info']);
  });

  it('keeps structural before semantic at the same severity level (stable sort)', () => {
    const structural = [structuralIssue({ severity: 'warning' })];
    const semantic = [
      semanticIssue({ severity: 'warning', code: 'MISSING_BRANCH', nodeIds: ['n_other'] }),
    ];
    const result = mergeIssues(structural, semantic);
    expect(result.issues[0]!.code).toBe('MISSING_FALLBACK');
    expect(result.issues[1]!.code).toBe('MISSING_BRANCH');
  });
});

describe('summarize (AC-R10)', () => {
  it('returns "No issues found." for an empty list', () => {
    expect(summarize([])).toBe('No issues found.');
  });

  it('uses singular nouns for a single issue', () => {
    expect(summarize([structuralIssue({ severity: 'error' })])).toBe('1 issue found (1 error).');
  });

  it('uses plural nouns for multiple issues', () => {
    const list: Issue[] = [
      structuralIssue({ severity: 'error' }),
      structuralIssue({ severity: 'error', code: 'DANGLING_EDGE' }),
    ];
    expect(summarize(list)).toBe('2 issues found (2 errors).');
  });

  it('lists counts in order error → warning → info, only when present', () => {
    const list: Issue[] = [
      structuralIssue({ severity: 'error' }),
      structuralIssue({ severity: 'warning' }),
      semanticIssue({ severity: 'info', code: 'UNCLEAR_QUESTION' }),
    ];
    expect(summarize(list)).toBe('3 issues found (1 error, 1 warning, 1 info).');
  });

  it('omits absent severities in the breakdown', () => {
    const list: Issue[] = [structuralIssue({ severity: 'warning' })];
    expect(summarize(list)).toBe('1 issue found (1 warning).');
  });
});

describe('mergeIssues — summary integration', () => {
  it('produces "No issues found." when both inputs are empty', () => {
    expect(mergeIssues([], []).summary).toBe('No issues found.');
  });

  it('reflects dedup in the summary counts', () => {
    const result = mergeIssues([structuralIssue()], [semanticIssue()]);
    expect(result.summary).toBe('1 issue found (1 warning).');
  });
});
