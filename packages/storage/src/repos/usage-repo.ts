import type { DatabaseSync } from 'node:sqlite';
import type { ProjectMemoryRecord, UsageRecord } from '../types.js';

export interface IncrementUsageParams {
  providerId: string;
  modelId: string;
  date: string; // YYYY-MM-DD
  requests?: number;
  tokensIn?: number;
  tokensOut?: number;
  activeMinutes?: number;
}

export interface QueryUsageParams {
  providerId?: string;
  modelId?: string;
  startDate?: string;
  endDate?: string;
}

export class UsageRepo {
  constructor(private readonly db: DatabaseSync) {}

  increment(params: IncrementUsageParams): void {
    const requests = params.requests ?? 1;
    const tokensIn = params.tokensIn ?? 0;
    const tokensOut = params.tokensOut ?? 0;
    const activeMinutes = params.activeMinutes ?? 0;

    const stmt = this.db.prepare(`
      INSERT INTO usage_local (provider_id, model_id, date, requests, tokens_in, tokens_out, active_minutes)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(provider_id, model_id, date) DO UPDATE SET
        requests = requests + excluded.requests,
        tokens_in = tokens_in + excluded.tokens_in,
        tokens_out = tokens_out + excluded.tokens_out,
        active_minutes = active_minutes + excluded.active_minutes;
    `);

    stmt.run(
      params.providerId,
      params.modelId,
      params.date,
      requests,
      tokensIn,
      tokensOut,
      activeMinutes
    );
  }

  get(providerId: string, modelId: string, date: string): UsageRecord | null {
    const stmt = this.db.prepare(
      'SELECT * FROM usage_local WHERE provider_id = ? AND model_id = ? AND date = ?'
    );
    const row = stmt.get(providerId, modelId, date);
    return (row as unknown as UsageRecord) || null;
  }

  query(params: QueryUsageParams = {}): UsageRecord[] {
    const conditions: string[] = [];
    const values: (string | number)[] = [];

    if (params.providerId) {
      conditions.push('provider_id = ?');
      values.push(params.providerId);
    }
    if (params.modelId) {
      conditions.push('model_id = ?');
      values.push(params.modelId);
    }
    if (params.startDate) {
      conditions.push('date >= ?');
      values.push(params.startDate);
    }
    if (params.endDate) {
      conditions.push('date <= ?');
      values.push(params.endDate);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const sql = `SELECT * FROM usage_local ${whereClause} ORDER BY date DESC, provider_id ASC`;
    const stmt = this.db.prepare(sql);
    return stmt.all(...values) as unknown as UsageRecord[];
  }
}

export class ProjectMemoryRepo {
  constructor(private readonly db: DatabaseSync) {}

  get(projectPath: string, key: string): string | null {
    const stmt = this.db.prepare(
      'SELECT value FROM project_memory WHERE project_path = ? AND key = ?'
    );
    const row = stmt.get(projectPath, key) as { value: string } | undefined;
    return row ? row.value : null;
  }

  set(projectPath: string, key: string, value: string): void {
    const stmt = this.db.prepare(`
      INSERT INTO project_memory (project_path, key, value, updated_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(project_path, key) DO UPDATE SET
        value = excluded.value,
        updated_at = excluded.updated_at;
    `);
    stmt.run(projectPath, key, value, Date.now());
  }

  list(projectPath: string): Record<string, string> {
    const stmt = this.db.prepare(
      'SELECT key, value FROM project_memory WHERE project_path = ? ORDER BY key ASC'
    );
    const rows = stmt.all(projectPath) as unknown as ProjectMemoryRecord[];
    const result: Record<string, string> = {};
    for (const r of rows) {
      result[r.key] = r.value;
    }
    return result;
  }
}
