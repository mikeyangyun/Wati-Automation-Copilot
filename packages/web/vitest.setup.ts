/**
 * Vitest global setup for the web package.
 *
 * React Flow expects browser-only DOM primitives that happy-dom v20 does not
 * ship with: `ResizeObserver`, `DOMMatrixReadOnly`, and a non-zero
 * `offsetWidth` / `offsetHeight` on its container. We provide minimal shims
 * here so tests that mount `<FlowGraph>` (directly or transitively) can
 * render without per-file boilerplate.
 *
 * Tests that opt into happy-dom via `// @vitest-environment happy-dom` get
 * these shims automatically. Pure node-environment tests are unaffected.
 */
class ResizeObserverShim {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

if (typeof globalThis.ResizeObserver === 'undefined') {
  globalThis.ResizeObserver = ResizeObserverShim as unknown as typeof ResizeObserver;
}

if (typeof globalThis.DOMMatrixReadOnly === 'undefined') {
  globalThis.DOMMatrixReadOnly = class {
    m22 = 1;
  } as unknown as typeof DOMMatrixReadOnly;
}

if (typeof HTMLElement !== 'undefined') {
  const has = (prop: string) => Object.prototype.hasOwnProperty.call(HTMLElement.prototype, prop);
  if (!has('offsetWidth')) {
    Object.defineProperty(HTMLElement.prototype, 'offsetWidth', {
      configurable: true,
      get(): number {
        return 800;
      },
    });
  }
  if (!has('offsetHeight')) {
    Object.defineProperty(HTMLElement.prototype, 'offsetHeight', {
      configurable: true,
      get(): number {
        return 600;
      },
    });
  }
}

/**
 * happy-dom v20 does not ship a `window.localStorage` implementation by
 * default. We back it with an in-memory Map per test process — adequate for
 * unit tests, and the production code uses the real browser localStorage.
 * The shim is reset between test files because vitest creates a fresh
 * window per file.
 */
if (
  typeof globalThis.window !== 'undefined' &&
  (globalThis.window as { localStorage?: unknown }).localStorage === undefined
) {
  const store = new Map<string, string>();
  const storage = {
    getItem(key: string): string | null {
      return store.has(key) ? (store.get(key) as string) : null;
    },
    setItem(key: string, value: string): void {
      store.set(key, String(value));
    },
    removeItem(key: string): void {
      store.delete(key);
    },
    clear(): void {
      store.clear();
    },
    key(index: number): string | null {
      const keys = Array.from(store.keys());
      return keys[index] ?? null;
    },
    get length(): number {
      return store.size;
    },
  } satisfies Storage;
  Object.defineProperty(globalThis.window, 'localStorage', {
    value: storage,
    writable: false,
    configurable: true,
  });
}
