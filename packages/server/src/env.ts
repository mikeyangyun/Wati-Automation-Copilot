import 'dotenv/config';
import { z, type ZodError } from 'zod';

/**
 * Treat empty-string env vars (`KEY=` in `.env` files) as unset. Otherwise
 * `z.string().min(1)` would surface a confusing "must contain at least 1
 * character" error for keys the developer simply has not filled in yet.
 */
const optionalNonEmpty = z.preprocess(
  (v) => (typeof v === 'string' && v.length === 0 ? undefined : v),
  z.string().min(1).optional(),
);

/**
 * Normalise a `CORS_ORIGIN` env string into the array shape `@fastify/cors`
 * matches against. Three operations, each motivated by a real prod incident:
 *
 *   1. Split on `,` so multiple origins (preview deploy + prod + custom domain)
 *      can coexist in a single env var. Render / Vercel UIs make multi-line
 *      values awkward, CSV stays single-line.
 *   2. Strip any trailing `/` — browsers' `Origin` header is bare host (no path,
 *      no trailing slash), and a misconfigured `https://app.example.com/` would
 *      otherwise fail the byte-for-byte string match silently and surface as a
 *      `Failed to fetch` in the SPA. Cheap to forgive.
 *   3. Drop empties so `","` or `"a,, b"` doesn't accidentally allow blanks.
 *
 * Wildcard `*` is preserved as a literal — `@fastify/cors` understands it.
 */
const corsOriginList = z
  .string()
  .default('http://localhost:5173')
  .transform((raw) =>
    raw
      .split(',')
      .map((s) => s.trim().replace(/\/+$/, ''))
      .filter((s) => s.length > 0),
  );

export const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().positive().default(3000),
    LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error']).default('info'),
    CORS_ORIGIN: corsOriginList,

    LLM_PROVIDER: z.string().default('deepseek'),
    // Heavy / quality model — used by FlowAgent (Generate) and ReviewAgent.review.
    // Default tracks DeepSeek's V4 Preview release (Apr 2026); `deepseek-chat` is
    // retired on Jul 24, 2026 and currently auto-routes to `deepseek-v4-flash`.
    LLM_MODEL: z.string().default('deepseek-v4-pro'),
    // Fast / cheap model — used by ReviewAgent.explain and any future low-stakes
    // surface. Falls back to LLM_MODEL when unset, so single-model deployments
    // stay backward compatible with no config change.
    LLM_FAST_MODEL: optionalNonEmpty,
    LLM_API_KEY: optionalNonEmpty,
    LLM_BASE_URL: optionalNonEmpty,
    LLM_TIMEOUT_MS: z.coerce.number().int().positive().default(30_000),
    LLM_MAX_RETRY: z.coerce.number().int().nonnegative().default(1),

    SIMULATION_MAX_RETRY: z.coerce.number().int().nonnegative().default(2),
  })
  .superRefine((data, ctx) => {
    const apiKeyRequired = data.NODE_ENV !== 'test' && data.LLM_PROVIDER !== 'mock';
    if (apiKeyRequired && !data.LLM_API_KEY) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['LLM_API_KEY'],
        message: 'LLM_API_KEY is required unless NODE_ENV=test or LLM_PROVIDER=mock',
      });
    }
  });

export type EnvConfig = z.infer<typeof envSchema>;

export class EnvValidationError extends Error {
  public readonly fieldErrors: Record<string, string[] | undefined>;

  constructor(zodError: ZodError) {
    super('Invalid environment configuration');
    this.name = 'EnvValidationError';
    this.fieldErrors = zodError.flatten().fieldErrors;
  }
}

export function parseEnv(env: NodeJS.ProcessEnv = process.env): EnvConfig {
  const parsed = envSchema.safeParse(env);
  if (!parsed.success) {
    throw new EnvValidationError(parsed.error);
  }
  return parsed.data;
}
