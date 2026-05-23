import { buildApp } from './app.js';
import { config } from './config.js';
import { logger } from './logger.js';

const app = await buildApp();

try {
  await app.listen({ port: config.PORT, host: '0.0.0.0' });
  logger.info({ port: config.PORT }, 'server listening');
} catch (err) {
  logger.error({ err }, 'failed to start server');
  process.exit(1);
}
