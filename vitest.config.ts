import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react-swc';
import { resolve } from 'node:path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': resolve(__dirname, 'src') },
  },
  test: {
    /*
     * The site's own tests, and only those. Without an include, vitest's
     * default glob sweeps the whole repo and collects the two packages that
     * ship beside the site, each of which needs its own runner:
     *
     *   cli/           has its own vitest project and its own dependencies,
     *                  and CI gives it its own job.
     *   ide/vscode/    its suite imports the `vscode` module and uses Mocha's
     *                  suite(), both of which exist only inside the VS Code
     *                  extension host. Nothing can run it here, so collecting
     *                  it only ever fails: it broke CI for two commits.
     */
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    environment: 'node',
    setupFiles: ['./src/test/setup.ts'],
    testTimeout: 20000,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov', 'json-summary'],
      thresholds: { statements: 58, branches: 50, functions: 45, lines: 60 },
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/test/**', 'src/toolRoutes.tsx', 'src/main.tsx'],
    },
  },
});
