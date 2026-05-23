import { z } from 'zod';

const isoTimestamp = z.string().datetime({ offset: true });

export const BotMessageSchema = z.object({
  role: z.literal('bot'),
  content: z.string().min(1),
  nodeId: z.string().min(1),
  timestamp: isoTimestamp,
});

export const UserMessageSchema = z.object({
  role: z.literal('user'),
  content: z.string().min(1),
  timestamp: isoTimestamp,
});

export const MessageSchema = z.discriminatedUnion('role', [BotMessageSchema, UserMessageSchema]);

export type BotMessage = z.infer<typeof BotMessageSchema>;
export type UserMessage = z.infer<typeof UserMessageSchema>;
export type Message = z.infer<typeof MessageSchema>;
