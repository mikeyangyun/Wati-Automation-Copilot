import 'dotenv/config';
import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error']).default('info'),
  CORS_ORIGIN: z.string().default('http://localhost:5173'),

  LLM_PROVIDER: z.string().default('deepseek'),
  LLM_MODEL: z.string().default('deepseek-chat'),
  LLM_API_KEY: z.string().optional(),
  LLM_BASE_URL: z.string().optional(),
  LLM_TIMEOUT_MS: z.coerce.number().int().positive().default(30_000),
  LLM_MAX_RETRY: z.coerce.number().int().nonnegative().default(1),

  SIMULATION_MAX_RETRY: z.coerce.number().int().nonnegative().default(2),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('Invalid environment configuration:', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const config = parsed.data;
export type Config = typeof config;
