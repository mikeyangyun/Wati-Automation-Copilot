import cors from '@fastify/cors';
import Fastify from 'fastify';
import type { Logger } from 'pino';

import { FlowAgent, type FlowGenerator } from './agents/flowAgent.js';
import { config } from './config.js';
import { errorHandler } from './errors.js';
import { createLLMProvider } from './llm/factory.js';
import { logger as defaultLogger } from './logger.js';
import { healthRoutes } from './routes/health.js';
import { registerApiRoutes } from './routes/index.js';
import { InMemoryStore } from './store/inMemoryStore.js';

export interface BuildAppOptions {
  loggerInstance?: Logger;
  /** Inject a FlowGenerator (typically a test stub). Defaults to a config-driven FlowAgent. */
  agent?: FlowGenerator;
  /** Inject an InMemoryStore (typically per-test). Defaults to a fresh instance. */
  store?: InMemoryStore;
}

export async function buildApp(opts: BuildAppOptions = {}) {
  const app = Fastify({
    loggerInstance: opts.loggerInstance ?? defaultLogger,
  });

  app.setErrorHandler(errorHandler);
  app.setNotFoundHandler((req, reply) => {
    void reply.status(404).send({
      error: {
        code: 'NOT_FOUND',
        message: `Route ${req.method}:${req.url} not found`,
      },
    });
  });

  const store = opts.store ?? new InMemoryStore();
  const agent = opts.agent ?? createDefaultAgent();

  await app.register(cors, { origin: config.CORS_ORIGIN });
  await app.register(healthRoutes);
  await app.register((scope) => registerApiRoutes(scope, { agent, store }));

  return app;
}

export type App = Awaited<ReturnType<typeof buildApp>>;

function createDefaultAgent(): FlowAgent {
  const providerConfig: Parameters<typeof createLLMProvider>[0] = {
    provider: config.LLM_PROVIDER,
  };
  if (config.LLM_API_KEY !== undefined) providerConfig.apiKey = config.LLM_API_KEY;
  if (config.LLM_BASE_URL !== undefined) providerConfig.baseUrl = config.LLM_BASE_URL;
  if (config.LLM_MODEL !== undefined) providerConfig.model = config.LLM_MODEL;
  if (config.LLM_TIMEOUT_MS !== undefined) providerConfig.timeoutMs = config.LLM_TIMEOUT_MS;

  const provider = createLLMProvider(providerConfig);
  return new FlowAgent({ provider, maxRetry: config.LLM_MAX_RETRY });
}
