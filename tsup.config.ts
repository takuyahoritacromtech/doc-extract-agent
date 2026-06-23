import { defineConfig } from 'tsup';

/**
 * Two entry points:
 *  - `index`     → the library public API (importable from other code).
 *  - `cli/index` → the executable CLI (referenced by the `bin` field).
 */
export default defineConfig({
  entry: {
    index: 'src/index.ts',
    'cli/index': 'src/cli/index.ts',
    server: 'src/infrastructure/http/main.ts',
  },
  format: ['esm'],
  target: 'node18',
  dts: true,
  clean: true,
  sourcemap: true,
  // Keep the shebang in the CLI bundle so it stays directly executable.
  banner: {},
});
