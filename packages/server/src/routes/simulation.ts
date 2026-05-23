import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { z } from 'zod';

import { AppError } from '../errors.js';
import type { FlowExecutor } from '../executor/flowExecutor.js';
import type { InMemoryStore } from '../store/inMemoryStore.js';

export interface SimulationRoutesDeps {
  executor: FlowExecutor;
  store: InMemoryStore;
}

const FlowIdParamsSchema = z.object({ id: z.string().min(1) });
const SessionIdParamsSchema = z.object({ sessionId: z.string().min(1) });

const StepBodySchema = z.object({
  message: z.string().trim().min(1),
});

export function buildSimulationRoutes(deps: SimulationRoutesDeps): FastifyPluginAsync {
  return async function simulationRoutes(app: FastifyInstance) {
    app.post('/flows/:id/simulate/start', async (req) => {
      const { id } = FlowIdParamsSchema.parse(req.params);
      const flow = deps.store.getFlow(id);
      if (!flow) {
        throw new AppError('FLOW_NOT_FOUND', `Flow ${id} not found`, 404);
      }
      return deps.executor.createSession(flow);
    });

    app.post('/simulate/:sessionId/step', async (req) => {
      const { sessionId } = SessionIdParamsSchema.parse(req.params);
      const { message } = StepBodySchema.parse(req.body);
      return deps.executor.step(sessionId, message);
    });

    app.post('/simulate/:sessionId/reset', async (req) => {
      const { sessionId } = SessionIdParamsSchema.parse(req.params);
      return deps.executor.reset(sessionId);
    });
  };
}
