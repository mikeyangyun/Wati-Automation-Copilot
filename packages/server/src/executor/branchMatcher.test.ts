import type { Edge } from 'shared';
import { describe, expect, it } from 'vitest';

import { matchBranch } from './branchMatcher.js';

const edge = (id: string, condition?: string): Edge => ({
  id,
  from: 'q',
  to: `t_${id}`,
  ...(condition !== undefined ? { condition } : {}),
});

describe('matchBranch', () => {
  const standardEdges: Edge[] = [
    edge('e_buyer', 'buyer'),
    edge('e_seller', 'seller'),
    edge('e_fb', 'fallback'),
  ];

  it('exact-matches a normalised reply against the condition label', () => {
    expect(matchBranch('buyer', standardEdges)).toEqual({ kind: 'exact', edge: standardEdges[0] });
    expect(matchBranch('seller', standardEdges)).toEqual({ kind: 'exact', edge: standardEdges[1] });
  });

  it('is case-insensitive', () => {
    expect(matchBranch('Buyer', standardEdges).kind).toBe('exact');
    expect(matchBranch('BUYER', standardEdges).kind).toBe('exact');
  });

  it('trims whitespace from the reply and the condition', () => {
    expect(matchBranch('   buyer   ', standardEdges).kind).toBe('exact');
    expect(matchBranch('buyer', [edge('e', '  buyer ')]).kind).toBe('exact');
  });

  it('falls back when no exact match is present and a fallback edge exists', () => {
    const result = matchBranch('???', standardEdges);
    expect(result).toEqual({ kind: 'fallback', edge: standardEdges[2] });
  });

  it('returns none when neither an exact match nor a fallback edge exists', () => {
    expect(matchBranch('xyz', [edge('e1', 'buyer'), edge('e2', 'seller')])).toEqual({
      kind: 'none',
    });
  });

  it('ignores unconditional advance edges (no condition)', () => {
    expect(matchBranch('whatever', [edge('e1'), edge('e2', 'fallback')]).kind).toBe('fallback');
  });

  it('does not substring-match (rules out fuzzy match by design)', () => {
    expect(matchBranch('i am a buyer', standardEdges).kind).toBe('fallback');
    expect(matchBranch('buyers', standardEdges).kind).toBe('fallback');
  });

  it('first matching edge wins when condition labels collide (degenerate flow)', () => {
    const dup = [edge('first', 'buyer'), edge('second', 'buyer'), edge('fb', 'fallback')];
    const result = matchBranch('buyer', dup);
    expect(result.kind).toBe('exact');
    expect((result as { edge: Edge }).edge.id).toBe('first');
  });
});
