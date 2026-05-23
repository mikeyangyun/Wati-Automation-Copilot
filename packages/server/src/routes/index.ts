import type { FastifyInstance } from 'fastify';

import type { FlowGenerator } from '../agents/flowAgent.js';
import type { InMemoryStore } from '../store/inMemoryStore.js';
import { buildFlowsRoutes } from './flows.js';

export interface ApiRoutesDeps {
  agent: FlowGenerator;
  store: InMemoryStore;
}

export async function registerApiRoutes(app: FastifyInstance, deps: ApiRoutesDeps): Promise<void> {
  await app.register(
    async (api) => {
      await api.register(buildFlowsRoutes(deps));
      // Future phases:
      //   await api.register(buildSimulateRoutes(deps));   // Phase 2
    },
    { prefix: '/api' },
  );
}
