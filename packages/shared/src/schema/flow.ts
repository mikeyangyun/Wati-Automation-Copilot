import { z } from 'zod';

import { EdgeSchema } from './edge.js';
import { NodeSchema } from './node.js';
import { TriggerSchema } from './trigger.js';

export const FlowSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  prompt: z.string().min(1),
  trigger: TriggerSchema,
  entryNodeId: z.string().min(1),
  nodes: z.array(NodeSchema).min(1),
  edges: z.array(EdgeSchema),
  createdAt: z.string().datetime({ offset: true }),
});

export type Flow = z.infer<typeof FlowSchema>;
