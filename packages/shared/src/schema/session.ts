import { z } from 'zod';

import { MessageSchema } from './message.js';

export const SessionStatusEnum = z.enum([
  'running',
  'waiting_for_input',
  'completed',
  'handed_off',
]);
export type SessionStatus = z.infer<typeof SessionStatusEnum>;

export const SessionContextSchema = z.object({
  retryCount: z.number().int().nonnegative(),
  lastQuestionNodeId: z.string().min(1).optional(),
});
export type SessionContext = z.infer<typeof SessionContextSchema>;

export const SessionSchema = z.object({
  id: z.string().min(1),
  flowId: z.string().min(1),
  currentNodeId: z.string().min(1),
  status: SessionStatusEnum,
  transcript: z.array(MessageSchema),
  context: SessionContextSchema,
});

export type Session = z.infer<typeof SessionSchema>;
