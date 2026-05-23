import { describe, expect, it } from 'vitest';

import { TriggerSchema } from './trigger.js';

describe('TriggerSchema (discriminated union)', () => {
  it('parses new_message trigger without a value', () => {
    const trigger = TriggerSchema.parse({ type: 'new_message' });
    expect(trigger.type).toBe('new_message');
  });

  it('parses a keyword trigger with a non-empty value', () => {
    const trigger = TriggerSchema.parse({ type: 'keyword', value: 'help' });
    expect(trigger.type).toBe('keyword');
    if (trigger.type === 'keyword') {
      expect(trigger.value).toBe('help');
    }
  });

  it('rejects a keyword trigger without a value', () => {
    expect(() => TriggerSchema.parse({ type: 'keyword' })).toThrow();
  });

  it('rejects a keyword trigger with an empty value', () => {
    expect(() => TriggerSchema.parse({ type: 'keyword', value: '' })).toThrow();
  });

  it('rejects an unknown trigger type', () => {
    expect(() => TriggerSchema.parse({ type: 'cron' })).toThrow();
  });
});
