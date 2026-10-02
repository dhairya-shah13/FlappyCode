import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/cli.ts'],
  format: ['esm'],
  target: 'node20',
  shims: true,
  external: [
    '@napi-rs/keyring',
    'better-sqlite3',
  ],
  noExternal: [
    '@flappycode/core',
    '@flappycode/protocol',
    '@flappycode/providers',
    '@flappycode/server',
    '@flappycode/storage',
    '@flappycode/tui',
  ],
});
