import 'dotenv/config';
import { z, type ZodError } from 'zod';

export const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().positive().default(3000),
    LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error']).default('info'),
    CORS_ORIGIN: z.string().default('http://localhost:5173'),

    LLM_PROVIDER: z.string().default('deepseek'),
    LLM_MODEL: z.string().default('deepseek-chat'),
    LLM_API_KEY: z.string().min(1).optional(),
    LLM_BASE_URL: z.string().optional(),
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
