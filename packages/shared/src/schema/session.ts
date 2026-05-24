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

/**
 * Descriptor of the input the simulation is currently waiting for. Only set
 * when the session is paused on an `ask_question` node. Carries enough
 * information for the chat UI to render the question prompt and any
 * `expectedReplies` as quick-reply chips, without needing the full Flow.
 */
export const AwaitingInputSchema = z.object({
  nodeId: z.string().min(1),
  text: z.string().min(1),
  /**
   * When present, must contain at least one entry — empty arrays are filtered
   * out at the executor boundary so the chat UI doesn't render an empty chip
   * group. The array element type is kept as plain `string[]` (not `[string,
   * ...string[]]`) for ergonomic interop with the LLM-emitted node config.
   */
  expectedReplies: z.array(z.string().min(1)).min(1).optional(),
});

export type AwaitingInput = z.infer<typeof AwaitingInputSchema>;
