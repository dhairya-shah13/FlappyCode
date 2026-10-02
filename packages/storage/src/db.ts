import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { MIGRATIONS } from './migrations.js';

export interface SqliteRunResult {
  changes: number | bigint;
  lastInsertRowid: number | bigint;
}

export interface SqliteStatement {
  run(...params: any[]): SqliteRunResult;
  get(...params: any[]): any;
  all(...params: any[]): any[];
}

export interface ISqliteDatabase {
  exec(sql: string): void;
  prepare(sql: string): SqliteStatement;
  pragma(sql: string): any;
  transaction<T extends (...args: any[]) => any>(fn: T): T;
  close(): void;
  readonly open: boolean;
}

export function getDefaultDatabasePath(): string {
  if (process.env.FLAPPYCODE_DB_PATH) {
    return process.env.FLAPPYCODE_DB_PATH;
  }
  const isWindows = process.platform === 'win32';
  let baseDir: string;
  if (isWindows) {
    baseDir = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
  } else {
    baseDir = process.env.XDG_DATA_HOME || path.join(os.homedir(), '.local', 'share');
  }
  const flappyDir = path.join(baseDir, 'flappycode');
  if (!fs.existsSync(flappyDir)) {
    fs.mkdirSync(flappyDir, { recursive: true });
  }
  return path.join(flappyDir, 'flappycode.db');
}

export interface FlappyDatabaseOptions {
  path?: string;
  readonly?: boolean;
}

function normalizeParam(v: any): any {
  if (v === true) return 1;
  if (v === false) return 0;
  if (v === undefined) return null;
  return v;
}

function normalizeParams(params: any[]): any[] {
  return params.map(normalizeParam);
}

class NodeSqliteAdapter implements ISqliteDatabase {
  private _open = true;

  constructor(private rawDb: any) {}

  public exec(sql: string): void {
    this.rawDb.exec(sql);
  }

  public prepare(sql: string): SqliteStatement {
    const rawStmt = this.rawDb.prepare(sql);
    return {
      run: (...params: any[]) => rawStmt.run(...normalizeParams(params)),
      get: (...params: any[]) => rawStmt.get(...normalizeParams(params)),
      all: (...params: any[]) => rawStmt.all(...normalizeParams(params)),
    };
  }

  public pragma(sql: string): any {
    if (sql.includes('=')) {
      this.rawDb.exec(`PRAGMA ${sql};`);
      return undefined;
    } else {
      const stmt = this.rawDb.prepare(`PRAGMA ${sql};`);
      return stmt.all();
    }
  }

  public transaction<T extends (...args: any[]) => any>(fn: T): T {
    return ((...args: any[]) => {
      this.rawDb.exec('BEGIN IMMEDIATE;');
      try {
        const result = fn(...args);
        this.rawDb.exec('COMMIT;');
        return result;
      } catch (err) {
        try {
          this.rawDb.exec('ROLLBACK;');
        } catch {}
        throw err;
      }
    }) as T;
  }

  public close(): void {
    if (this._open) {
      this.rawDb.close();
      this._open = false;
    }
  }

  public get open(): boolean {
    return this._open;
  }
}

class BetterSqliteAdapter implements ISqliteDatabase {
  constructor(private rawDb: any) {}

  public exec(sql: string): void {
    this.rawDb.exec(sql);
  }

  public prepare(sql: string): SqliteStatement {
    const rawStmt = this.rawDb.prepare(sql);
    return {
      run: (...params: any[]) => rawStmt.run(...normalizeParams(params)),
      get: (...params: any[]) => rawStmt.get(...normalizeParams(params)),
      all: (...params: any[]) => rawStmt.all(...normalizeParams(params)),
    };
  }

  public pragma(sql: string): any {
    return this.rawDb.pragma(sql);
  }

  public transaction<T extends (...args: any[]) => any>(fn: T): T {
    return this.rawDb.transaction(fn);
  }

  public close(): void {
    this.rawDb.close();
  }

  public get open(): boolean {
    return this.rawDb.open;
  }
}

function suppressSqliteWarning(): void {
  const originalEmitWarning = process.emitWarning;
  process.emitWarning = (warning: any, ...args: any[]) => {
    if (typeof warning === 'string' && warning.includes('SQLite is an experimental feature')) return;
    if (warning && typeof warning === 'object' && warning.message?.includes('SQLite is an experimental feature')) return;
    return (originalEmitWarning as any).call(process, warning, ...args);
  };
}

function loadNodeSqlite(): any {
  suppressSqliteWarning();
  if (typeof (process as any).getBuiltinModule === 'function') {
    const mod = (process as any).getBuiltinModule('node:sqlite');
    if (mod) return mod;
  }
  const modName = 'node:' + 'sqlite';
  return require(modName);
}

function initializeAdapter(dbPath: string, readonly: boolean): ISqliteDatabase {
  let betterErr: any = null;

  // 1. Try better-sqlite3 first (standard Node 20/22 with prebuilt binaries)
  try {
    const betterMod = 'better-sqlite3';
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const betterSqlite = require(betterMod);
    const raw = new betterSqlite(dbPath, { readonly });
    return new BetterSqliteAdapter(raw);
  } catch (err: any) {
    betterErr = err;
  }

  // 2. Try Node.js built-in node:sqlite (native in Node 22/24)
  try {
    const sqliteMod = loadNodeSqlite();
    const { DatabaseSync } = sqliteMod;
    const raw = new DatabaseSync(dbPath, {
      readOnly: readonly,
      open: true,
    });
    return new NodeSqliteAdapter(raw);
  } catch (nodeErr: any) {
    throw new Error(
      `Failed to initialize SQLite storage for '${dbPath}'. Neither 'better-sqlite3' nor 'node:sqlite' could be loaded.\n` +
      `  - better-sqlite3 error: ${betterErr?.message}\n` +
      `  - node:sqlite error: ${nodeErr?.message}\n` +
      `Please ensure Node.js is >= 20.0.0 (Node 22+ recommended for built-in SQLite support on all platforms).`
    );
  }
}

export class FlappyDatabase {
  public readonly db: ISqliteDatabase;
  private readonly dbPath: string;

  constructor(options: FlappyDatabaseOptions = {}) {
    this.dbPath = options.path || getDefaultDatabasePath();

    if (this.dbPath !== ':memory:') {
      const dir = path.dirname(this.dbPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    }

    this.db = initializeAdapter(this.dbPath, options.readonly ?? false);

    // Enable WAL mode for safe concurrent access per SystemArchitecture
    if (!options.readonly && this.dbPath !== ':memory:') {
      this.db.pragma('journal_mode = WAL');
    }
    this.db.pragma('foreign_keys = ON');

    if (!options.readonly) {
      this.runMigrations();
    }
  }

  private runMigrations(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS schema_version (
        version INTEGER PRIMARY KEY,
        applied_at INTEGER NOT NULL
      );
    `);

    const appliedVersions = new Set<number>(
      (this.db.prepare('SELECT version FROM schema_version').all() as { version: number }[]).map(
        (r) => r.version
      )
    );

    const applyTx = this.db.transaction((version: number, sql: string) => {
      this.db.exec(sql);
      this.db.prepare('INSERT INTO schema_version (version, applied_at) VALUES (?, ?)').run(
        version,
        Date.now()
      );
    });

    for (const migration of MIGRATIONS) {
      if (!appliedVersions.has(migration.version)) {
        applyTx(migration.version, migration.sql);
      }
    }
  }

  public close(): void {
    if (this.db.open) {
      this.db.close();
    }
  }
}
