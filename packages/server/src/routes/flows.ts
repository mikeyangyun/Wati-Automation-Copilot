import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { z } from 'zod';

import type { FlowGenerator } from '../agents/flowAgent.js';
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

export function buildFlowsRoutes(deps: FlowsRoutesDeps): FastifyPluginAsync {
  return async function flowsRoutes(app: FastifyInstance) {
    app.post('/flows/generate', async (req) => {
      const body = GenerateRequestSchema.parse(req.body);
      const flow = await deps.agent.generate(body.prompt);
      deps.store.saveFlow(flow);
      return { flow };
    });
  };
}
