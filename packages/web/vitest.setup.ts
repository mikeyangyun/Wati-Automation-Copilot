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
