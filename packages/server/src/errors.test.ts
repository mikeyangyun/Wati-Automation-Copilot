import Fastify from 'fastify';
import { pino } from 'pino';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { AppError, errorHandler } from './errors.js';

const silentLogger = pino({ level: 'silent' });

function buildErrorFixture() {
  const app = Fastify({ loggerInstance: silentLogger });
  app.setErrorHandler(errorHandler);

  app.get('/throw/app', async () => {
    throw new AppError('FLOW_NOT_FOUND', 'No flow with id flow_x', 404);
  });

  const BodySchema = z.object({ name: z.string().min(1) });
  app.post('/throw/zod', async (req) => BodySchema.parse(req.body));

  app.get('/throw/unknown', async () => {
    throw new Error('boom');
  });

  return app;
}

describe('AppError', () => {
  it('captures code, message, and statusCode', () => {
    const err = new AppError('FLOW_NOT_FOUND', 'gone', 404);
    expect(err.code).toBe('FLOW_NOT_FOUND');
    expect(err.message).toBe('gone');
    expect(err.statusCode).toBe(404);
    expect(err.name).toBe('AppError');
    expect(err).toBeInstanceOf(Error);
  });
});

describe('errorHandler', () => {
  it('serialises AppError into the standard error shape', async () => {
    const app = buildErrorFixture();
    const res = await app.inject({ method: 'GET', url: '/throw/app' });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({
      error: { code: 'FLOW_NOT_FOUND', message: 'No flow with id flow_x' },
    });
  });

  it('maps a ZodError thrown in a handler to 400 INVALID_INPUT', async () => {
    const app = buildErrorFixture();
    const res = await app.inject({
      method: 'POST',
      url: '/throw/zod',
      payload: { name: '' },
    });
    expect(res.statusCode).toBe(400);
    const body = res.json() as { error: { code: string; message: string } };
    expect(body.error.code).toBe('INVALID_INPUT');
    expect(body.error.message.length).toBeGreaterThan(0);
  });

  it('falls back to 500 INTERNAL for unrecognised errors', async () => {
    const app = buildErrorFixture();
    const res = await app.inject({ method: 'GET', url: '/throw/unknown' });
    expect(res.statusCode).toBe(500);
    const body = res.json() as { error: { code: string } };
    expect(body.error.code).toBe('INTERNAL');
  });
});
