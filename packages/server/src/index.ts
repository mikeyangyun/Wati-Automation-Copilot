import Fastify from 'fastify';
import cors from '@fastify/cors';
import { config } from './config.js';
import { logger } from './logger.js';
import { healthRoutes } from './routes/health.js';

const app = Fastify({ loggerInstance: logger });

await app.register(cors, { origin: config.CORS_ORIGIN });
await app.register(healthRoutes);

try {
  await app.listen({ port: config.PORT, host: '0.0.0.0' });
  logger.info({ port: config.PORT }, 'server listening');
} catch (err) {
  logger.error({ err }, 'failed to start server');
  process.exit(1);
}
