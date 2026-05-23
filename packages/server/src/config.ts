import { EnvValidationError, parseEnv, type EnvConfig } from './env.js';

function loadConfig(): EnvConfig {
  try {
    return parseEnv();
  } catch (err) {
    if (err instanceof EnvValidationError) {
      console.error('Invalid environment configuration:', err.fieldErrors);
    } else {
      console.error('Failed to load configuration:', err);
    }
    process.exit(1);
  }
}

export const config = loadConfig();
export type Config = EnvConfig;
