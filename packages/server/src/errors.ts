import type { FastifyError, FastifyReply, FastifyRequest } from 'fastify';
import { ZodError } from 'zod';

export type ErrorCode =
  | 'INVALID_INPUT'
  | 'FLOW_NOT_FOUND'
  | 'SESSION_NOT_FOUND'
  | 'LLM_OUTPUT_INVALID'
  | 'LLM_UNAVAILABLE'
  | 'NOT_FOUND';

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

/**
 * Cap on the joined message length so a noisy schema can't blow up the
 * response or leak excessive shape detail to clients.
 */
const ZOD_MESSAGE_MAX = 300;

/**
 * Flatten a ZodError into a short human-readable string suitable for a
 * client error body. Example: `prompt: Required; age: Number must be ...`.
 *
 * Each entry takes the form `<dotted.path>: <message>` (or just `<message>`
 * when the issue has no path, e.g. cross-field refinements at the root).
 */
export function flattenZodError(err: ZodError): string {
  const parts = err.errors.map((issue) => {
    const path = issue.path.join('.');
    return path ? `${path}: ${issue.message}` : issue.message;
  });
  const joined = parts.join('; ');
  return joined.length > ZOD_MESSAGE_MAX ? `${joined.slice(0, ZOD_MESSAGE_MAX - 1)}…` : joined;
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
      error: { code: 'INVALID_INPUT', message: flattenZodError(err) },
    });
    return;
  }

  req.log.error({ err }, 'unhandled error');
  void reply.status(500).send({
    error: { code: 'INTERNAL', message: 'Internal server error' },
  });
}
