import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react-swc';
import { resolve } from 'node:path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': resolve(__dirname, 'src') },
  },
  test: {
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
