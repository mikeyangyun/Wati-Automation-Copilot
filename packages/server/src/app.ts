import cors from '@fastify/cors';
import Fastify from 'fastify';
import type { Logger } from 'pino';

import { FlowAgent, type FlowGenerator } from './agents/flowAgent.js';
import { ReviewAgent, type FlowReviewer } from './agents/reviewAgent.js';
import { config } from './config.js';
import { errorHandler } from './errors.js';
import { FlowExecutor } from './executor/flowExecutor.js';
import { createLLMProvider, type LLMProviderConfig } from './llm/factory.js';
import type { LLMProvider } from './llm/types.js';
import { logger as defaultLogger } from './logger.js';
import { healthRoutes } from './routes/health.js';
import { registerApiRoutes } from './routes/index.js';
import { InMemoryStore } from './store/inMemoryStore.js';

export interface BuildAppOptions {
  loggerInstance?: Logger;
  /** Inject a FlowGenerator (typically a test stub). Defaults to a config-driven FlowAgent. */
  agent?: FlowGenerator;
  /** Inject a FlowReviewer (typically a test stub). Defaults to a config-driven ReviewAgent. */
  reviewer?: FlowReviewer;
  /** Inject a FlowExecutor (typically a test stub). Defaults to one bound to the same store. */
  executor?: FlowExecutor;
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

  // Share one LLM provider between FlowAgent and ReviewAgent — both stateless,
  // both billable from the same key. Only constructed if at least one agent
  // wasn't injected (tests inject both and avoid touching env entirely).
  const needsProvider = opts.agent === undefined || opts.reviewer === undefined;
  const provider = needsProvider ? createDefaultProvider() : null;

  const agent =
    opts.agent ?? new FlowAgent({ provider: provider!, maxRetry: config.LLM_MAX_RETRY });
  const reviewer =
    opts.reviewer ?? new ReviewAgent({ provider: provider!, maxRetry: config.LLM_MAX_RETRY });
  const executor =
    opts.executor ?? new FlowExecutor({ store, maxRetry: config.SIMULATION_MAX_RETRY });

  await app.register(cors, { origin: config.CORS_ORIGIN });
  await app.register(healthRoutes);
  await app.register((scope) => registerApiRoutes(scope, { agent, reviewer, executor, store }));

  return app;
}

export type App = Awaited<ReturnType<typeof buildApp>>;

function createDefaultProvider(): LLMProvider {
  const providerConfig: LLMProviderConfig = {
    provider: config.LLM_PROVIDER,
  };
  if (config.LLM_API_KEY !== undefined) providerConfig.apiKey = config.LLM_API_KEY;
  if (config.LLM_BASE_URL !== undefined) providerConfig.baseUrl = config.LLM_BASE_URL;
  if (config.LLM_MODEL !== undefined) providerConfig.model = config.LLM_MODEL;
  if (config.LLM_TIMEOUT_MS !== undefined) providerConfig.timeoutMs = config.LLM_TIMEOUT_MS;
  return createLLMProvider(providerConfig);
}
