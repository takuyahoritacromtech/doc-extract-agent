import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    // Fail the run if a test accidentally has no assertions.
    passWithNoTests: false,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/**/*.ts'],
      // The CLI wiring and barrel file are thin glue; logic lives in the layers below.
      exclude: ['src/cli/**', 'src/index.ts'],
      // Note: the v8 coverage provider requires Node >= 20 (CI uses Node 20).
    },
  },
});
