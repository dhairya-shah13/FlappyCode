import { ISqliteDatabase } from '../db.js';

export interface ProviderHealthRecord {
  provider_id: string;
  status: 'healthy' | 'degraded' | 'unreachable' | 'unknown' | 'auth_failed' | 'rate_limited';
  latency_ms: number;
  error_count: number;
  total_checks: number;
  last_checked_at: number;
  last_success_at: number | null;
  last_error: string | null;
}

export class ProviderHealthRepository {
  constructor(private db: ISqliteDatabase) {}

  public recordCheck(check: {
    provider_id: string;
    status: 'healthy' | 'degraded' | 'unreachable' | 'unknown' | 'auth_failed' | 'rate_limited';
    latency_ms: number;
    error?: string;
  }): ProviderHealthRecord {
    const now = Date.now();
    const isSuccess = check.status === 'healthy';

    const existing = this.get(check.provider_id);
    const totalChecks = (existing?.total_checks || 0) + 1;
    const errorCount = isSuccess ? 0 : (existing?.error_count || 0) + 1;
    const lastSuccessAt = isSuccess ? now : (existing?.last_success_at || null);
    const lastError = isSuccess ? null : (check.error || 'Unknown error');

    const stmt = this.db.prepare(`
      INSERT INTO provider_health (
        provider_id, status, latency_ms, error_count, total_checks,
        last_checked_at, last_success_at, last_error
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(provider_id) DO UPDATE SET
        status = excluded.status,
        latency_ms = excluded.latency_ms,
        error_count = excluded.error_count,
        total_checks = excluded.total_checks,
        last_checked_at = excluded.last_checked_at,
        last_success_at = excluded.last_success_at,
        last_error = excluded.last_error
    `);

    stmt.run(
      check.provider_id,
      check.status,
      check.latency_ms,
      errorCount,
      totalChecks,
      now,
      lastSuccessAt,
      lastError
    );

    return {
      provider_id: check.provider_id,
      status: check.status,
      latency_ms: check.latency_ms,
      error_count: errorCount,
      total_checks: totalChecks,
      last_checked_at: now,
      last_success_at: lastSuccessAt,
      last_error: lastError,
    };
  }

  public get(provider_id: string): ProviderHealthRecord | null {
    const row = this.db.prepare('SELECT * FROM provider_health WHERE provider_id = ?').get(provider_id) as any;
    if (!row) return null;
    return this.mapRow(row);
  }

  public listAll(): ProviderHealthRecord[] {
    const rows = this.db.prepare('SELECT * FROM provider_health ORDER BY provider_id ASC').all() as any[];
    return rows.map((r) => this.mapRow(r));
  }

  public delete(provider_id: string): void {
    this.db.prepare('DELETE FROM provider_health WHERE provider_id = ?').run(provider_id);
  }

  private mapRow(row: any): ProviderHealthRecord {
    return {
      provider_id: row.provider_id,
      status: row.status,
      latency_ms: row.latency_ms,
      error_count: row.error_count,
      total_checks: row.total_checks,
      last_checked_at: row.last_checked_at,
      last_success_at: row.last_success_at || null,
      last_error: row.last_error || null,
    };
  }
}
