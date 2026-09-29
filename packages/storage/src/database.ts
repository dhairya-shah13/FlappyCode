import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { runMigrations } from './migrations/runner.js';
import { getDatabasePath } from './paths.js';

export interface DatabaseOptions {
  path?: string;
  autoMigrate?: boolean;
}

export function createDatabase(options: DatabaseOptions = {}): DatabaseSync {
  const dbPath = getDatabasePath(options.path);

  if (dbPath !== ':memory:') {
    const parentDir = path.dirname(dbPath);
    if (!fs.existsSync(parentDir)) {
      fs.mkdirSync(parentDir, { recursive: true });
    }
  }

  const db = new DatabaseSync(dbPath);

  // Enable WAL mode if on-disk
  if (dbPath !== ':memory:') {
    db.exec('PRAGMA journal_mode = WAL;');
  }

  // Enforce foreign keys
  db.exec('PRAGMA foreign_keys = ON;');

  if (options.autoMigrate !== false) {
    runMigrations(db);
  }

  return db;
}
