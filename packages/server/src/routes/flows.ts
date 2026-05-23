import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { z } from 'zod';

import type { FlowGenerator } from '../agents/flowAgent.js';
import { AppError } from '../errors.js';
import type { InMemoryStore } from '../store/inMemoryStore.js';

export interface FlowsRoutesDeps {
  agent: FlowGenerator;
  store: InMemoryStore;
}

/**
 * Body schema for POST /api/flows/generate.
 * `.trim()` normalises stored/forwarded prompt; `.min(1)` then rejects
 * whitespace-only input at the edge before any LLM call is made.
 */
const GenerateRequestSchema = z.object({
  prompt: z.string().trim().min(1),
});

const FlowIdParamsSchema = z.object({
  id: z.string().min(1),
});

export function buildFlowsRoutes(deps: FlowsRoutesDeps): FastifyPluginAsync {
  return async function flowsRoutes(app: FastifyInstance) {
    app.post('/flows/generate', async (req) => {
      const body = GenerateRequestSchema.parse(req.body);
      const flow = await deps.agent.generate(body.prompt);
      deps.store.saveFlow(flow);
      return { flow };
    });

    app.get('/flows/:id', async (req) => {
      const { id } = FlowIdParamsSchema.parse(req.params);
      const flow = deps.store.getFlow(id);
      if (!flow) {
        throw new AppError('FLOW_NOT_FOUND', `Flow ${id} not found`, 404);
      }
      return { flow };
    });
  };
}
