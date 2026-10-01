import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export * from './types.js';
export * from './profiles.js';
export * from './openai-compatible.js';
export * from './ollama.js';
export * from './anthropic.js';
export * from './google.js';
export * from './mock.js';

export function loadCommunityModelsSnapshot(): Record<string, any> {
  try {
    const currentDir = path.dirname(fileURLToPath(import.meta.url));
    const jsonPath = path.join(currentDir, 'community-models.json');
    if (fs.existsSync(jsonPath)) {
      const raw = fs.readFileSync(jsonPath, 'utf8');
      return JSON.parse(raw);
    }
    // Also check root/src if in development
    const srcJsonPath = path.join(currentDir, '..', 'src', 'community-models.json');
    if (fs.existsSync(srcJsonPath)) {
      const raw = fs.readFileSync(srcJsonPath, 'utf8');
      return JSON.parse(raw);
    }
    return { version: '2026.10.01', models: {} };
  } catch {
    return { version: '2026.10.01', models: {} };
  }
}
