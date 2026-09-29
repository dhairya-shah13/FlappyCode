import type { DatabaseSync } from 'node:sqlite';
import { MIGRATION_001_INIT } from './001_init.js';

export interface Migration {
  name: string;
  sql: string;
}

export const MIGRATIONS: Migration[] = [
  {
    name: '001_init',
    sql: MIGRATION_001_INIT,
  },
];

export function runMigrations(db: DatabaseSync): string[] {
  // Ensure _migrations table exists
  db.exec(`
    CREATE TABLE IF NOT EXISTS _migrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL,
      applied_at INTEGER NOT NULL
    );
  `);

  const appliedRows = db.prepare('SELECT name FROM _migrations').all() as { name: string }[];
  const appliedSet = new Set(appliedRows.map((r) => r.name));

  const newlyApplied: string[] = [];

  for (const migration of MIGRATIONS) {
    if (!appliedSet.has(migration.name)) {
      db.exec(migration.sql);
      const stmt = db.prepare('INSERT INTO _migrations (name, applied_at) VALUES (?, ?)');
      stmt.run(migration.name, Date.now());
      newlyApplied.push(migration.name);
    }
  }

  return newlyApplied;
}
