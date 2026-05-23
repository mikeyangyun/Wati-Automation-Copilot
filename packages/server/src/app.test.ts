import type { Flow } from 'shared';
import { pino } from 'pino';
import { describe, expect, it } from 'vitest';

import type { FlowGenerator } from './agents/flowAgent.js';
import type { FlowReviewer } from './agents/reviewAgent.js';
import { buildApp } from './app.js';
import { InMemoryStore } from './store/inMemoryStore.js';

const silentLogger = pino({ level: 'silent' });

const stubAgent: FlowGenerator = {
  generate: async (_prompt: string): Promise<Flow> => {
    throw new Error('stub agent should not be invoked by these tests');
  },
};

const stubReviewer: FlowReviewer = {
  explain: async () => {
    throw new Error('stub reviewer should not be invoked by these tests');
  },
};

const minimalDeps = () => ({
  agent: stubAgent,
  reviewer: stubReviewer,
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

  it('returns a 404 in the standard {error:{code,message}} shape for unknown paths', async () => {
    const app = await buildApp({ loggerInstance: silentLogger, ...minimalDeps() });
    try {
      const res = await app.inject({ method: 'GET', url: '/api/does-not-exist' });
      expect(res.statusCode).toBe(404);
      const body = res.json() as { error: { code: string; message: string } };
      expect(body.error.code).toBe('NOT_FOUND');
      expect(body.error.message).toMatch(/does-not-exist/);
    } finally {
      await app.close();
    }
  });

  it('returns a 404 NOT_FOUND for unknown paths outside /api as well', async () => {
    const app = await buildApp({ loggerInstance: silentLogger, ...minimalDeps() });
    try {
      const res = await app.inject({ method: 'GET', url: '/totally-unknown' });
      expect(res.statusCode).toBe(404);
      const body = res.json() as { error: { code: string } };
      expect(body.error.code).toBe('NOT_FOUND');
    } finally {
      await app.close();
    }
  });
});
