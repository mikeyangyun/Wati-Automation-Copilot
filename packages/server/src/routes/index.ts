import type { FastifyInstance } from 'fastify';

export async function registerApiRoutes(app: FastifyInstance): Promise<void> {
  await app.register(
    async (_api) => {
      // Business routes are registered here in later phases:
      //   await api.register(flowsRoutes);
      //   await api.register(simulateRoutes);
    },
    { prefix: '/api' },
  );
}
