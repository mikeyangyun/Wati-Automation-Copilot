import { FlowSchema, type Flow } from 'shared';

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

  private async requestJson(path: string, init: RequestInit): Promise<unknown> {
    const url = `${this.baseUrl}${path}`;

    let response: Response;
    try {
      response = await this.fetchFn(url, {
        ...init,
        headers: {
          'Content-Type': 'application/json',
          ...(init.headers ?? {}),
        },
      });
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

/** Default singleton — components import the standalone functions below. */
export const apiClient = new ApiClient();

export const generateFlow = (prompt: string, signal?: AbortSignal): Promise<Flow> =>
  apiClient.generateFlow(prompt, signal);

export const getFlow = (id: string, signal?: AbortSignal): Promise<Flow> =>
  apiClient.getFlow(id, signal);

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
