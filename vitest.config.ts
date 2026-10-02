import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    testTimeout: 20000,
    coverage: {
      provider: 'v8',
      include: ['packages/*/src/**'],
      exclude: ['packages/*/src/**/*.d.ts', 'packages/*/src/index.ts'],
      clean: false,
      thresholds: {
        lines: 70,
        functions: 80,
        branches: 70,
        statements: 70,
      },
    },
  },
  resolve: {
    alias: {
      '@flappycode/protocol': path.resolve(__dirname, 'packages/protocol/src'),
      '@flappycode/storage': path.resolve(__dirname, 'packages/storage/src'),
      '@flappycode/providers': path.resolve(__dirname, 'packages/providers/src'),
      '@flappycode/core': path.resolve(__dirname, 'packages/core/src'),
      '@flappycode/tui': path.resolve(__dirname, 'packages/tui/src'),
      '@flappycode/server': path.resolve(__dirname, 'packages/server/src'),
    },
  },
});
