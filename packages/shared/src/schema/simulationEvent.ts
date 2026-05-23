import { z } from 'zod';

/**
 * Discriminated union of events the `FlowExecutor` may emit during a simulation
 * step. Events are observability metadata — they explain *why* the executor made
 * the choices it made (which branch was taken, why a fallback happened, etc).
 *
 * Events MUST NOT be required to reconstruct the conversation; the `transcript`
 * is the source of truth for what the bot/user said.
 */

export const BranchEventSchema = z.object({
  type: z.literal('branch'),
  from: z.string().min(1),
  to: z.string().min(1),
  /** The matched `edge.condition` label, omitted when the edge was unconditional. */
  condition: z.string().min(1).optional(),
});

export const FallbackEventSchema = z.object({
  type: z.literal('fallback'),
  nodeId: z.string().min(1),
  reason: z.string().min(1),
});

export const RetryEventSchema = z.object({
  type: z.literal('retry'),
  nodeId: z.string().min(1),
  /** Post-increment retry count (the value that was just stored on the session). */
  count: z.number().int().nonnegative(),
});

export const MockApiCallEventSchema = z.object({
  type: z.literal('mock-api-call'),
  nodeId: z.string().min(1),
  url: z.string().url().optional(),
});

export const HandoffEventSchema = z.object({
  type: z.literal('handoff'),
  nodeId: z.string().min(1),
  /**
   * Team name from the originating `assign_to_team` node, OR the literal
   * string `'human'` when the handoff was triggered by exceeding
   * `SIMULATION_MAX_RETRY`.
   */
  team: z.string().min(1),
});

export const SimulationEventSchema = z.discriminatedUnion('type', [
  BranchEventSchema,
  FallbackEventSchema,
  RetryEventSchema,
  MockApiCallEventSchema,
  HandoffEventSchema,
]);

export type BranchEvent = z.infer<typeof BranchEventSchema>;
export type FallbackEvent = z.infer<typeof FallbackEventSchema>;
export type RetryEvent = z.infer<typeof RetryEventSchema>;
export type MockApiCallEvent = z.infer<typeof MockApiCallEventSchema>;
export type HandoffEvent = z.infer<typeof HandoffEventSchema>;
export type SimulationEvent = z.infer<typeof SimulationEventSchema>;
