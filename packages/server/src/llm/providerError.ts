/**
 * Build a debuggable one-line summary of a provider transport failure.
 *
 * Node's native `fetch` (undici) reports network-layer problems with a
 * top-level message of `fetch failed` and the real reason — `ENOTFOUND`,
 * `ECONNRESET`, `UND_ERR_SOCKET`, `ETIMEDOUT`, … — buried in `err.cause`.
 * Surfacing only `err.message` (as `LLM provider error: fetch failed`)
 * leaves no clue whether the issue is DNS, TLS, idle-socket churn, or a
 * remote 5xx, which makes triage on a live demo painful.
 *
 * The summary is bounded to keep noisy stack chains out of the error
 * envelope returned to the client.
 */
export function describeProviderError(err: unknown): string {
  if (!(err instanceof Error)) return String(err);

  const cause = (err as Error & { cause?: unknown }).cause;
  if (cause && typeof cause === 'object') {
    const code = (cause as { code?: unknown }).code;
    const causeMessage = (cause as { message?: unknown }).message;
    const parts: string[] = [];
    if (typeof code === 'string' && code.length > 0) parts.push(code);
    if (
      typeof causeMessage === 'string' &&
      causeMessage.length > 0 &&
      causeMessage !== err.message
    ) {
      parts.push(causeMessage);
    }
    if (parts.length > 0) {
      return `${err.message} (cause: ${parts.join(' — ')})`;
    }
  }
  return err.message;
}
