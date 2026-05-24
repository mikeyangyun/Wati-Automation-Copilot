import {
  AwaitingInputSchema,
  FlowSchema,
  IssueSchema,
  SessionSchema,
  SimulationEventSchema,
  type AwaitingInput,
  type Flow,
  type Issue,
  type IssueCode,
  type Session,
  type SimulationEvent,
} from 'shared';
import { z } from 'zod';

/**
 * Server envelope returned by `start` / `step` / `reset` simulation endpoints.
 * Kept here (not in shared) because it is purely an HTTP boundary type.
 */
export const SessionEnvelopeSchema = z.object({
  session: SessionSchema,
  botMessages: z.array(z.string()),
  events: z.array(SimulationEventSchema),
  awaitingInput: AwaitingInputSchema.optional(),
});
export type SessionEnvelope = z.infer<typeof SessionEnvelopeSchema>;

/**
 * Server envelope returned by `POST /api/flows/:id/review`. Lives in the web
 * package because it is an HTTP boundary type that combines structural and
 * semantic issues with a pre-rendered summary string.
 */
export const ReviewResultSchema = z.object({
  issues: z.array(IssueSchema),
  summary: z.string().min(1),
});
export type ReviewResult = z.infer<typeof ReviewResultSchema>;

export type { AwaitingInput, Issue, IssueCode, Session, SimulationEvent };

/**
 * Mirrors the server's error envelope shape: `{ error: { code, message } }`.
 * The full set of `code` values lives in docs/data-model.md.
 */
export interface ApiErrorBody {
  code: string;
  message: string;
}

/**
 * Thrown by all ApiClient methods.
 *
 * `status` is the HTTP status from the server, or `0` for transport-level
 * failures (network error, abort, JSON-shape mismatch from the server).
 */
export class ApiError extends Error {
  public readonly code: string;
  public readonly status: number;

  constructor(code: string, message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
  }
}

export interface ApiClientOptions {
  /**
   * Prefix prepended to every request path. Defaults to '' so the client
   * sends same-origin requests (Vite dev proxy handles `/api` in development).
   */
  baseUrl?: string;
  /** Injectable fetch — primarily for unit tests. */
  fetch?: typeof globalThis.fetch;
}

export class ApiClient {
  private readonly baseUrl: string;
  private readonly fetchFn: typeof globalThis.fetch;

  constructor(opts: ApiClientOptions = {}) {
    this.baseUrl = opts.baseUrl ?? '';
    this.fetchFn = opts.fetch ?? globalThis.fetch.bind(globalThis);
  }

  async generateFlow(prompt: string, signal?: AbortSignal): Promise<Flow> {
    const json = await this.requestJson('/api/flows/generate', {
      method: 'POST',
      body: JSON.stringify({ prompt }),
      ...(signal ? { signal } : {}),
    });
    return parseFlowEnvelope(json);
  }

  async getFlow(id: string, signal?: AbortSignal): Promise<Flow> {
    const json = await this.requestJson(`/api/flows/${encodeURIComponent(id)}`, {
      method: 'GET',
      ...(signal ? { signal } : {}),
    });
    return parseFlowEnvelope(json);
  }

  async startSession(flowId: string, signal?: AbortSignal): Promise<SessionEnvelope> {
    const json = await this.requestJson(`/api/flows/${encodeURIComponent(flowId)}/simulate/start`, {
      method: 'POST',
      ...(signal ? { signal } : {}),
    });
    return parseSessionEnvelope(json);
  }

  async stepSession(
    sessionId: string,
    message: string,
    signal?: AbortSignal,
  ): Promise<SessionEnvelope> {
    const json = await this.requestJson(`/api/simulate/${encodeURIComponent(sessionId)}/step`, {
      method: 'POST',
      body: JSON.stringify({ message }),
      ...(signal ? { signal } : {}),
    });
    return parseSessionEnvelope(json);
  }

  async resetSession(sessionId: string, signal?: AbortSignal): Promise<SessionEnvelope> {
    const json = await this.requestJson(`/api/simulate/${encodeURIComponent(sessionId)}/reset`, {
      method: 'POST',
      ...(signal ? { signal } : {}),
    });
    return parseSessionEnvelope(json);
  }

  async explainFlow(flowId: string, signal?: AbortSignal): Promise<string> {
    const json = await this.requestJson(`/api/flows/${encodeURIComponent(flowId)}/explain`, {
      method: 'POST',
      ...(signal ? { signal } : {}),
    });
    return parseExplanationEnvelope(json);
  }

  async reviewFlow(flowId: string, signal?: AbortSignal): Promise<ReviewResult> {
    const json = await this.requestJson(`/api/flows/${encodeURIComponent(flowId)}/review`, {
      method: 'POST',
      ...(signal ? { signal } : {}),
    });
    return parseReviewEnvelope(json);
  }

  private async requestJson(path: string, init: RequestInit): Promise<unknown> {
    const url = `${this.baseUrl}${path}`;

    // Only declare a JSON body when we actually send one. Setting
    // `Content-Type: application/json` on a body-less POST trips Fastify's
    // default parser, which (correctly) rejects empty JSON payloads.
    const hasBody = init.body !== undefined && init.body !== null;
    const headers: Record<string, string> = {
      ...((init.headers as Record<string, string> | undefined) ?? {}),
    };
    if (hasBody && headers['Content-Type'] === undefined) {
      headers['Content-Type'] = 'application/json';
    }

    let response: Response;
    try {
      response = await this.fetchFn(url, { ...init, headers });
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      throw new ApiError('NETWORK_ERROR', `Network request failed: ${reason}`, 0);
    }

    const text = await response.text();
    const json: unknown = text ? safeJsonParse(text) : undefined;

    if (!response.ok) {
      const errBody = extractErrorBody(json);
      throw new ApiError(
        errBody?.code ?? 'UNKNOWN',
        errBody?.message ?? `HTTP ${response.status}`,
        response.status,
      );
    }
    return json;
  }
}

/**
 * Default singleton — components import the standalone functions below.
 *
 * `VITE_API_BASE_URL` lets production builds bypass any reverse-proxy layer
 * (e.g. Vercel rewrites with their ~30s edge timeout) and call the API host
 * directly. Leave it unset in dev so the Vite proxy continues to handle
 * `/api` and `/health` against `http://localhost:3000`.
 */
const envBaseUrl = (import.meta.env.VITE_API_BASE_URL ?? '').trim().replace(/\/$/, '');
export const apiClient = new ApiClient(envBaseUrl ? { baseUrl: envBaseUrl } : {});

export const generateFlow = (prompt: string, signal?: AbortSignal): Promise<Flow> =>
  apiClient.generateFlow(prompt, signal);

export const getFlow = (id: string, signal?: AbortSignal): Promise<Flow> =>
  apiClient.getFlow(id, signal);

export const startSession = (flowId: string, signal?: AbortSignal): Promise<SessionEnvelope> =>
  apiClient.startSession(flowId, signal);

export const stepSession = (
  sessionId: string,
  message: string,
  signal?: AbortSignal,
): Promise<SessionEnvelope> => apiClient.stepSession(sessionId, message, signal);

export const resetSession = (sessionId: string, signal?: AbortSignal): Promise<SessionEnvelope> =>
  apiClient.resetSession(sessionId, signal);

export const explainFlow = (flowId: string, signal?: AbortSignal): Promise<string> =>
  apiClient.explainFlow(flowId, signal);

export const reviewFlow = (flowId: string, signal?: AbortSignal): Promise<ReviewResult> =>
  apiClient.reviewFlow(flowId, signal);

function safeJsonParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

function extractErrorBody(json: unknown): ApiErrorBody | undefined {
  if (typeof json !== 'object' || json === null) return undefined;
  const error = (json as { error?: unknown }).error;
  if (typeof error !== 'object' || error === null) return undefined;
  const { code, message } = error as { code?: unknown; message?: unknown };
  if (typeof code !== 'string' || typeof message !== 'string') return undefined;
  return { code, message };
}

function parseFlowEnvelope(json: unknown): Flow {
  if (typeof json !== 'object' || json === null) {
    throw new ApiError('INVALID_RESPONSE', 'Response was not a JSON object', 0);
  }
  const flow = (json as { flow?: unknown }).flow;
  const parsed = FlowSchema.safeParse(flow);
  if (!parsed.success) {
    throw new ApiError(
      'INVALID_RESPONSE',
      `Server response did not match Flow schema: ${parsed.error.message.slice(0, 200)}`,
      0,
    );
  }
  return parsed.data;
}

function parseSessionEnvelope(json: unknown): SessionEnvelope {
  const parsed = SessionEnvelopeSchema.safeParse(json);
  if (!parsed.success) {
    throw new ApiError(
      'INVALID_RESPONSE',
      `Server response did not match SessionEnvelope schema: ${parsed.error.message.slice(0, 200)}`,
      0,
    );
  }
  return parsed.data;
}

function parseExplanationEnvelope(json: unknown): string {
  if (typeof json !== 'object' || json === null) {
    throw new ApiError('INVALID_RESPONSE', 'Response was not a JSON object', 0);
  }
  const explanation = (json as { explanation?: unknown }).explanation;
  if (typeof explanation !== 'string' || explanation.length === 0) {
    throw new ApiError(
      'INVALID_RESPONSE',
      'Server response was missing a non-empty `explanation` string',
      0,
    );
  }
  return explanation;
}

function parseReviewEnvelope(json: unknown): ReviewResult {
  const parsed = ReviewResultSchema.safeParse(json);
  if (!parsed.success) {
    throw new ApiError(
      'INVALID_RESPONSE',
      `Server response did not match ReviewResult schema: ${parsed.error.message.slice(0, 200)}`,
      0,
    );
  }
  return parsed.data;
}
