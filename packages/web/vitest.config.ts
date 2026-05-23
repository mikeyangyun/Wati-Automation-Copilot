import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.{ts,tsx}'],
    environment: 'node',
    // Required so @testing-library/react picks up afterEach and runs auto-cleanup
    // between tests. Per-file `// @vitest-environment happy-dom` opts a single
    // test file into DOM emulation without affecting the node-environment tests.
    globals: true,
  },
});
