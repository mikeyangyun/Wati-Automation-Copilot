import type { FastifyInstance } from 'fastify';

import type { FlowGenerator } from '../agents/flowAgent.js';
import type { FlowReviewer } from '../agents/reviewAgent.js';
import type { FlowExecutor } from '../executor/flowExecutor.js';
import type { InMemoryStore } from '../store/inMemoryStore.js';
import { buildFlowsRoutes } from './flows.js';
import { buildSimulationRoutes } from './simulation.js';

export interface ApiRoutesDeps {
  agent: FlowGenerator;
  reviewer: FlowReviewer;
  executor: FlowExecutor;
  store: InMemoryStore;
}

export async function registerApiRoutes(app: FastifyInstance, deps: ApiRoutesDeps): Promise<void> {
  await app.register(
    async (api) => {
      await api.register(
        buildFlowsRoutes({ agent: deps.agent, reviewer: deps.reviewer, store: deps.store }),
      );
      await api.register(buildSimulationRoutes({ executor: deps.executor, store: deps.store }));
    },
    { prefix: '/api' },
  );
}
