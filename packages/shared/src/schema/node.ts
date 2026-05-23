import { z } from 'zod';

export const NodeTypeEnum = z.enum([
  'trigger',
  'send_message',
  'ask_question',
  'condition',
  'assign_to_team',
  'api_call',
  'wait',
]);
export type NodeType = z.infer<typeof NodeTypeEnum>;

const PositionSchema = z.object({
  x: z.number(),
  y: z.number(),
});

const baseShape = {
  id: z.string().min(1),
  label: z.string().min(1),
  position: PositionSchema.optional(),
};

const EmptyConfig = z.object({}).passthrough();

export const TriggerNodeSchema = z.object({
  ...baseShape,
  type: z.literal('trigger'),
  config: EmptyConfig,
});

export const SendMessageNodeSchema = z.object({
  ...baseShape,
  type: z.literal('send_message'),
  config: z.object({
    text: z.string().min(1),
  }),
});

export const AskQuestionNodeSchema = z.object({
  ...baseShape,
  type: z.literal('ask_question'),
  config: z.object({
    text: z.string().min(1),
    expectedReplies: z.array(z.string().min(1)).optional(),
  }),
});

export const ConditionNodeSchema = z.object({
  ...baseShape,
  type: z.literal('condition'),
  config: EmptyConfig,
});

export const AssignToTeamNodeSchema = z.object({
  ...baseShape,
  type: z.literal('assign_to_team'),
  config: z.object({
    team: z.string().min(1),
  }),
});

export const HttpMethodEnum = z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']);
export type HttpMethod = z.infer<typeof HttpMethodEnum>;

export const ApiCallNodeSchema = z.object({
  ...baseShape,
  type: z.literal('api_call'),
  config: z.object({
    url: z.string().url(),
    method: HttpMethodEnum,
    description: z.string().min(1).optional(),
  }),
});

export const WaitNodeSchema = z.object({
  ...baseShape,
  type: z.literal('wait'),
  config: z.object({
    durationMs: z.number().int().nonnegative(),
  }),
});

export const NodeSchema = z.discriminatedUnion('type', [
  TriggerNodeSchema,
  SendMessageNodeSchema,
  AskQuestionNodeSchema,
  ConditionNodeSchema,
  AssignToTeamNodeSchema,
  ApiCallNodeSchema,
  WaitNodeSchema,
]);

export type TriggerNode = z.infer<typeof TriggerNodeSchema>;
export type SendMessageNode = z.infer<typeof SendMessageNodeSchema>;
export type AskQuestionNode = z.infer<typeof AskQuestionNodeSchema>;
export type ConditionNode = z.infer<typeof ConditionNodeSchema>;
export type AssignToTeamNode = z.infer<typeof AssignToTeamNodeSchema>;
export type ApiCallNode = z.infer<typeof ApiCallNodeSchema>;
export type WaitNode = z.infer<typeof WaitNodeSchema>;
export type Node = z.infer<typeof NodeSchema>;
