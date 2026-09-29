import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  createDatabase,
  FlappyStorage,
  getDatabasePath,
  getStorageDir,
  runMigrations,
} from '../index.js';

describe('Storage Paths Resolver', () => {
  it('resolves storage directory respecting overrides', () => {
    const custom = path.resolve('temp/my-custom-storage');
    expect(getStorageDir(custom)).toBe(custom);
  });

  it('resolves database path with :memory: special case', () => {
    expect(getDatabasePath(':memory:')).toBe(':memory:');
  });
});

describe('Database & Migrations', () => {
  it('runs migrations idempotently on in-memory database', () => {
    const db = createDatabase({ path: ':memory:', autoMigrate: false });
    const applied1 = runMigrations(db);
    expect(applied1).toEqual(['001_init']);

    // Second run should apply 0 migrations
    const applied2 = runMigrations(db);
    expect(applied2).toEqual([]);

    db.close();
  });

  it('enables foreign keys and WAL mode on disk database', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'flappy-db-test-'));
    const dbFile = path.join(tmpDir, 'test.db');

    const db = createDatabase({ path: dbFile });

    const fkRes = db.prepare('PRAGMA foreign_keys;').get() as { foreign_keys: number };
    expect(fkRes.foreign_keys).toBe(1);

    const journalRes = db.prepare('PRAGMA journal_mode;').get() as { journal_mode: string };
    expect(journalRes.journal_mode.toLowerCase()).toBe('wal');

    db.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });
});

describe('Repositories CRUD', () => {
  let storage: FlappyStorage;

  beforeEach(() => {
    storage = new FlappyStorage({ path: ':memory:' });
  });

  afterEach(() => {
    storage.close();
  });

  it('manages providers lifecycle', () => {
    storage.providers.upsert({
      id: 'groq',
      type: 'openai_compatible',
      display_name: 'Groq Cloud',
      base_url: 'https://api.groq.com/openai/v1',
      enabled: 1,
      max_concurrency: 4,
      created_at: 1000,
    });

    const p = storage.providers.get('groq');
    expect(p).not.toBeNull();
    expect(p?.display_name).toBe('Groq Cloud');
    expect(p?.enabled).toBe(1);

    storage.providers.setEnabled('groq', false);
    expect(storage.providers.get('groq')?.enabled).toBe(0);

    const list = storage.providers.list();
    expect(list).toHaveLength(1);

    expect(storage.providers.delete('groq')).toBe(true);
    expect(storage.providers.get('groq')).toBeNull();
  });

  it('manages models and cascades on provider deletion', () => {
    storage.providers.upsert({
      id: 'openrouter',
      type: 'openai_compatible',
      display_name: 'OpenRouter',
      enabled: 1,
      max_concurrency: 5,
      created_at: 1000,
    });

    storage.models.upsert({
      provider_id: 'openrouter',
      model_id: 'meta-llama/llama-3-8b-instruct:free',
      tier: 'free',
      tier_source: 'metadata',
      context_length: 8192,
      modality: 'text',
      supports_tools: 1,
      supports_vision: 0,
      price_in: 0,
      price_out: 0,
      avg_latency_ms: 250,
      last_validated_at: 2000,
    });

    const m = storage.models.get('openrouter', 'meta-llama/llama-3-8b-instruct:free');
    expect(m).toBeDefined();
    expect(m?.tier).toBe('free');

    const freeModels = storage.models.listByTier('free');
    expect(freeModels).toHaveLength(1);

    // Set and get model override
    storage.models.setOverride({
      provider_id: 'openrouter',
      model_id: 'meta-llama/llama-3-8b-instruct:free',
      tier: 'rate_limited_free',
      created_at: 3000,
    });

    const override = storage.models.getOverride('openrouter', 'meta-llama/llama-3-8b-instruct:free');
    expect(override?.tier).toBe('rate_limited_free');

    // Cascade delete test
    storage.providers.delete('openrouter');
    expect(storage.models.get('openrouter', 'meta-llama/llama-3-8b-instruct:free')).toBeNull();
  });

  it('tracks sessions and messages in order', () => {
    storage.sessions.create({
      id: 'sess-1',
      project_path: 'C:/Projects/Demo',
      created_at: 1000,
      updated_at: 1000,
      summary: 'Initial session',
    });

    const msg1 = storage.messages.append({
      session_id: 'sess-1',
      role: 'user',
      content: 'Hello Flappy',
      created_at: 1010,
    });

    const msg2 = storage.messages.append({
      session_id: 'sess-1',
      role: 'assistant',
      content: 'Ready to code!',
      created_at: 1020,
    });

    expect(msg1.id).toBeGreaterThan(0);
    expect(msg2.id).toBeGreaterThan(msg1.id);

    const msgs = storage.messages.listBySession('sess-1');
    expect(msgs).toHaveLength(2);
    expect(msgs[0].role).toBe('user');
    expect(msgs[1].role).toBe('assistant');
  });

  it('increments and aggregates local usage metrics correctly', () => {
    storage.usage.increment({
      providerId: 'groq',
      modelId: 'llama-3.1-8b',
      date: '2026-09-29',
      requests: 1,
      tokensIn: 100,
      tokensOut: 50,
      activeMinutes: 2,
    });

    // Second call on the same date accumulates counts
    storage.usage.increment({
      providerId: 'groq',
      modelId: 'llama-3.1-8b',
      date: '2026-09-29',
      requests: 2,
      tokensIn: 250,
      tokensOut: 150,
      activeMinutes: 3,
    });

    const u = storage.usage.get('groq', 'llama-3.1-8b', '2026-09-29');
    expect(u).not.toBeNull();
    expect(u?.requests).toBe(3);
    expect(u?.tokens_in).toBe(350);
    expect(u?.tokens_out).toBe(200);
    expect(u?.active_minutes).toBe(5);

    const queried = storage.usage.query({ providerId: 'groq' });
    expect(queried).toHaveLength(1);
    expect(queried[0].tokens_in).toBe(350);
  });

  it('manages project memory key-values', () => {
    const proj = 'C:/Projects/FlappyCode';
    storage.memory.set(proj, 'preferred-test-runner', 'vitest');
    storage.memory.set(proj, 'primary-language', 'typescript');

    expect(storage.memory.get(proj, 'preferred-test-runner')).toBe('vitest');

    const all = storage.memory.list(proj);
    expect(all).toEqual({
      'preferred-test-runner': 'vitest',
      'primary-language': 'typescript',
    });
  });
});

describe('Privacy Invariant Verification (SRS §6.1 / §8)', () => {
  let storage: FlappyStorage;

  beforeEach(() => {
    storage = new FlappyStorage({ path: ':memory:' });
  });

  afterEach(() => {
    storage.close();
  });

  it('verifies usage_local schema strictly contains only non-sensitive metrics', () => {
    const tableInfo = storage.db.prepare('PRAGMA table_info(usage_local);').all() as {
      name: string;
      type: string;
    }[];

    const columnNames = tableInfo.map((c) => c.name);
    const expectedColumns = [
      'provider_id',
      'model_id',
      'date',
      'requests',
      'tokens_in',
      'tokens_out',
      'active_minutes',
    ];

    expect(columnNames.sort()).toEqual(expectedColumns.sort());

    // Strict privacy assertions: verify NO prompt, text, path, key or user payload exists
    const forbiddenSubstrings = ['prompt', 'message', 'text', 'content', 'path', 'key', 'auth', 'secret', 'user'];
    for (const col of columnNames) {
      for (const forbidden of forbiddenSubstrings) {
        expect(col.toLowerCase()).not.toContain(forbidden);
      }
    }
  });
});
