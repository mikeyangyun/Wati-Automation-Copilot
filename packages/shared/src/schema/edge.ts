import { z } from 'zod';

export const EdgeSchema = z
  .object({
    id: z.string().min(1),
    from: z.string().min(1),
    to: z.string().min(1),
    condition: z.string().min(1).optional(),
  })
  .refine((edge) => edge.from !== edge.to, {
    message: 'Edge cannot connect a node to itself',
    path: ['to'],
  });

export type Edge = z.infer<typeof EdgeSchema>;
