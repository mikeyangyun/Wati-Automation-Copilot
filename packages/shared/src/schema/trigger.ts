import { z } from 'zod';

export const NewMessageTriggerSchema = z.object({
  type: z.literal('new_message'),
});

export const KeywordTriggerSchema = z.object({
  type: z.literal('keyword'),
  value: z.string().min(1),
});

export const TriggerSchema = z.discriminatedUnion('type', [
  NewMessageTriggerSchema,
  KeywordTriggerSchema,
]);

export type Trigger = z.infer<typeof TriggerSchema>;
