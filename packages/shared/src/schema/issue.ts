import { z } from 'zod';

export const SeverityEnum = z.enum(['error', 'warning', 'info']);
export type Severity = z.infer<typeof SeverityEnum>;

export const IssueCodeEnum = z.enum([
  'MISSING_ENTRY',
  'UNREACHABLE_NODE',
  'MISSING_FALLBACK',
  'DUPLICATE_CONDITION',
  'DANGLING_EDGE',
  'MISSING_BRANCH',
  'AMBIGUOUS_ROUTING',
  'UNCLEAR_QUESTION',
  'SEMANTIC_REVIEW_UNAVAILABLE',
]);
export type IssueCode = z.infer<typeof IssueCodeEnum>;

export const IssueSchema = z.object({
  severity: SeverityEnum,
  code: IssueCodeEnum,
  message: z.string().min(1),
  nodeIds: z.array(z.string().min(1)).default([]),
});

export type Issue = z.infer<typeof IssueSchema>;
