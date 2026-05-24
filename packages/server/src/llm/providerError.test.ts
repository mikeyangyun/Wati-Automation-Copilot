import { describe, expect, it } from 'vitest';

import { describeProviderError } from './providerError.js';

describe('describeProviderError', () => {
  it('returns the message unchanged when there is no cause', () => {
    expect(describeProviderError(new Error('socket hang up'))).toBe('socket hang up');
  });

  it('extracts a string code from err.cause and appends it', () => {
    // Shape that Node native fetch attaches for DNS / TCP / TLS failures.
    const cause = { code: 'ENOTFOUND' };
    const err = new Error('fetch failed', { cause });
    expect(describeProviderError(err)).toBe('fetch failed (cause: ENOTFOUND)');
  });

  it('also appends the cause message when it differs from the outer message', () => {
    const cause = { code: 'UND_ERR_SOCKET', message: 'other side closed' };
    const err = new Error('fetch failed', { cause });
    expect(describeProviderError(err)).toBe(
      'fetch failed (cause: UND_ERR_SOCKET — other side closed)',
    );
  });

  it('does not duplicate the cause message when it matches the outer message', () => {
    const cause = { code: 'ECONNRESET', message: 'fetch failed' };
    const err = new Error('fetch failed', { cause });
    expect(describeProviderError(err)).toBe('fetch failed (cause: ECONNRESET)');
  });

  it('ignores a cause that lacks both code and a useful message', () => {
    const err = new Error('boom', { cause: { unrelated: 42 } });
    expect(describeProviderError(err)).toBe('boom');
  });

  it('handles a cause that is only a message (no code)', () => {
    const cause = { message: 'underlying reason' };
    const err = new Error('outer', { cause });
    expect(describeProviderError(err)).toBe('outer (cause: underlying reason)');
  });

  it('coerces non-Error throws via String()', () => {
    expect(describeProviderError('plain string')).toBe('plain string');
    expect(describeProviderError(42)).toBe('42');
    expect(describeProviderError(null)).toBe('null');
  });
});
