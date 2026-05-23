import cors from '@fastify/cors';
import Fastify from 'fastify';
import type { Logger } from 'pino';

import { config } from './config.js';
import { errorHandler } from './errors.js';
import { logger as defaultLogger } from './logger.js';
import { healthRoutes } from './routes/health.js';
import { registerApiRoutes } from './routes/index.js';

export interface BuildAppOptions {
  loggerInstance?: Logger;
}

export async function buildApp(opts: BuildAppOptions = {}) {
  const app = Fastify({
    loggerInstance: opts.loggerInstance ?? defaultLogger,
  });

  app.setErrorHandler(errorHandler);

  await app.register(cors, { origin: config.CORS_ORIGIN });
  await app.register(healthRoutes);
  await app.register(registerApiRoutes);

  return app;
}

export type App = Awaited<ReturnType<typeof buildApp>>;
