import { describe, expect, it } from 'vitest';

import { EnvValidationError, parseEnv } from './env.js';

describe('parseEnv — defaults and coercion', () => {
  it('applies defaults to optional fields when only NODE_ENV is provided', () => {
    const env = parseEnv({ NODE_ENV: 'test' });
    expect(env.PORT).toBe(3000);
    expect(env.LOG_LEVEL).toBe('info');
    expect(env.CORS_ORIGIN).toBe('http://localhost:5173');
    expect(env.LLM_PROVIDER).toBe('deepseek');
    expect(env.LLM_MODEL).toBe('deepseek-chat');
    expect(env.LLM_TIMEOUT_MS).toBe(30_000);
    expect(env.LLM_MAX_RETRY).toBe(1);
    expect(env.SIMULATION_MAX_RETRY).toBe(2);
  });

  it('coerces numeric string env values', () => {
    const env = parseEnv({
      NODE_ENV: 'test',
      PORT: '4000',
      LLM_TIMEOUT_MS: '10000',
      LLM_MAX_RETRY: '0',
    });
    expect(env.PORT).toBe(4000);
    expect(env.LLM_TIMEOUT_MS).toBe(10_000);
    expect(env.LLM_MAX_RETRY).toBe(0);
  });
});

describe('parseEnv — LLM_API_KEY requirement', () => {
  it('accepts a missing LLM_API_KEY when NODE_ENV is test', () => {
    const env = parseEnv({ NODE_ENV: 'test' });
    expect(env.LLM_API_KEY).toBeUndefined();
  });

  it('accepts a missing LLM_API_KEY when LLM_PROVIDER is mock', () => {
    const env = parseEnv({ NODE_ENV: 'production', LLM_PROVIDER: 'mock' });
    expect(env.LLM_API_KEY).toBeUndefined();
  });

  it('requires LLM_API_KEY in production with the default provider', () => {
    expect(() => parseEnv({ NODE_ENV: 'production' })).toThrow(EnvValidationError);
  });

  it('requires LLM_API_KEY in development with the default provider', () => {
    expect(() => parseEnv({ NODE_ENV: 'development' })).toThrow(EnvValidationError);
  });

  it('accepts a non-empty LLM_API_KEY in production', () => {
    const env = parseEnv({ NODE_ENV: 'production', LLM_API_KEY: 'sk-test' });
    expect(env.LLM_API_KEY).toBe('sk-test');
    expect(env.LLM_PROVIDER).toBe('deepseek');
  });

  it('rejects an empty-string LLM_API_KEY', () => {
    expect(() => parseEnv({ NODE_ENV: 'production', LLM_API_KEY: '' })).toThrow(EnvValidationError);
  });

  it('surfaces the offending field path in EnvValidationError.fieldErrors', () => {
    try {
      parseEnv({ NODE_ENV: 'production' });
      throw new Error('expected parseEnv to throw');
    } catch (err) {
      expect(err).toBeInstanceOf(EnvValidationError);
      const fieldErrors = (err as EnvValidationError).fieldErrors;
      expect(fieldErrors.LLM_API_KEY).toBeDefined();
      expect(fieldErrors.LLM_API_KEY?.[0]).toMatch(/LLM_API_KEY/i);
    }
  });
});

describe('parseEnv — invalid values', () => {
  it('rejects an unknown NODE_ENV value', () => {
    expect(() => parseEnv({ NODE_ENV: 'staging', LLM_API_KEY: 'sk-test' })).toThrow(
      EnvValidationError,
    );
  });

  it('rejects a non-positive PORT', () => {
    expect(() => parseEnv({ NODE_ENV: 'test', PORT: '0' })).toThrow(EnvValidationError);
  });

  it('rejects an unknown LOG_LEVEL', () => {
    expect(() => parseEnv({ NODE_ENV: 'test', LOG_LEVEL: 'verbose' })).toThrow(EnvValidationError);
  });
});
