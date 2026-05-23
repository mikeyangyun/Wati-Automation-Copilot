import type { FastifyError, FastifyReply, FastifyRequest } from 'fastify';
import { ZodError } from 'zod';

export type ErrorCode =
  | 'INVALID_INPUT'
  | 'FLOW_NOT_FOUND'
  | 'SESSION_NOT_FOUND'
  | 'LLM_OUTPUT_INVALID'
  | 'LLM_UNAVAILABLE';

export class AppError extends Error {
  public readonly code: ErrorCode;
  public readonly statusCode: number;

  constructor(code: ErrorCode, message: string, statusCode: number) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.statusCode = statusCode;
  }
}

export function errorHandler(
  err: FastifyError | Error,
  req: FastifyRequest,
  reply: FastifyReply,
): void {
  if (err instanceof AppError) {
    void reply.status(err.statusCode).send({
      error: { code: err.code, message: err.message },
    });
    return;
  }

  if (err instanceof ZodError) {
    void reply.status(400).send({
      error: { code: 'INVALID_INPUT', message: err.message },
    });
    return;
  }

  req.log.error({ err }, 'unhandled error');
  void reply.status(500).send({
    error: { code: 'INTERNAL', message: 'Internal server error' },
  });
}
