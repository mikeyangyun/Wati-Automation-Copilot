import type { Flow } from 'shared';
import { pino } from 'pino';
import { describe, expect, it } from 'vitest';

import type { FlowGenerator } from './agents/flowAgent.js';
import { buildApp } from './app.js';
import { InMemoryStore } from './store/inMemoryStore.js';

const silentLogger = pino({ level: 'silent' });

const stubAgent: FlowGenerator = {
  generate: async (_prompt: string): Promise<Flow> => {
    throw new Error('stub agent should not be invoked by these tests');
  },
};

const minimalDeps = () => ({
  agent: stubAgent,
  store: new InMemoryStore(),
});

describe('buildApp', () => {
  it('serves GET /health with a 200 even after the /api scope is mounted', async () => {
    const app = await buildApp({ loggerInstance: silentLogger, ...minimalDeps() });
    try {
      const res = await app.inject({ method: 'GET', url: '/health' });
      expect(res.statusCode).toBe(200);
      const body = res.json() as { status: string };
      expect(body.status).toBe('ok');
    } finally {
      await app.close();
    }
  });

  it('returns 404 for unknown paths under /api', async () => {
    const app = await buildApp({ loggerInstance: silentLogger, ...minimalDeps() });
    try {
      const res = await app.inject({ method: 'GET', url: '/api/does-not-exist' });
      expect(res.statusCode).toBe(404);
    } finally {
      await app.close();
    }
  });
});
