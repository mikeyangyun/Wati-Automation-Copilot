import { describe, expect, it } from 'vitest';

import { IssueCodeEnum, IssueSchema } from './issue.js';

describe('IssueSchema', () => {
  it('parses a structural error issue', () => {
    const result = IssueSchema.parse({
      severity: 'error',
      code: 'MISSING_ENTRY',
      message: 'No entry node defined',
      nodeIds: [],
    });
    expect(result.code).toBe('MISSING_ENTRY');
    expect(result.severity).toBe('error');
  });

  it('defaults nodeIds to an empty array when omitted', () => {
    const result = IssueSchema.parse({
      severity: 'warning',
      code: 'UNCLEAR_QUESTION',
      message: 'Question is compound',
    });
    expect(result.nodeIds).toEqual([]);
  });

  it('rejects an unknown severity', () => {
    expect(() =>
      IssueSchema.parse({
        severity: 'critical',
        code: 'MISSING_ENTRY',
        message: 'x',
      }),
    ).toThrow();
  });

  it('rejects an unknown code', () => {
    expect(() =>
      IssueSchema.parse({
        severity: 'error',
        code: 'TOTALLY_MADE_UP',
        message: 'x',
      }),
    ).toThrow();
  });

  it('exposes the documented issue code set', () => {
    const codes = IssueCodeEnum.options;
    expect(codes).toEqual(
      expect.arrayContaining([
        'MISSING_ENTRY',
        'UNREACHABLE_NODE',
        'MISSING_FALLBACK',
        'DUPLICATE_CONDITION',
        'DANGLING_EDGE',
        'UNREACHABLE_REPLY',
        'MISSING_BRANCH',
        'AMBIGUOUS_ROUTING',
        'UNCLEAR_QUESTION',
        'SEMANTIC_REVIEW_UNAVAILABLE',
      ]),
    );
  });

  it('parses the SEMANTIC_REVIEW_UNAVAILABLE info issue', () => {
    const result = IssueSchema.parse({
      severity: 'info',
      code: 'SEMANTIC_REVIEW_UNAVAILABLE',
      message: 'LLM semantic review is temporarily unavailable.',
    });
    expect(result.severity).toBe('info');
    expect(result.code).toBe('SEMANTIC_REVIEW_UNAVAILABLE');
    expect(result.nodeIds).toEqual([]);
  });
});
