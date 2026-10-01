import { ISqliteDatabase } from '../db.js';
import { ProviderConfig } from '@flappycode/protocol';

export class ProviderRepository {
  constructor(private db: ISqliteDatabase) {}

  public save(provider: ProviderConfig): void {
    const stmt = this.db.prepare(`
      INSERT INTO provider (id, type, display_name, base_url, auth_ref, enabled, data_use_policy, max_concurrency, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        type = excluded.type,
        display_name = excluded.display_name,
        base_url = excluded.base_url,
        auth_ref = excluded.auth_ref,
        enabled = excluded.enabled,
        data_use_policy = excluded.data_use_policy,
        max_concurrency = excluded.max_concurrency
    `);

    stmt.run(
      provider.id,
      provider.type,
      provider.display_name,
      provider.base_url || null,
      provider.api_key_ref || null,
      provider.enabled ? 1 : 0,
      provider.data_use_policy,
      provider.max_concurrency ?? 4,
      provider.created_at || Date.now()
    );
  }

  public get(id: string): ProviderConfig | null {
    const row = this.db.prepare('SELECT * FROM provider WHERE id = ?').get(id) as any;
    if (!row) return null;
    return this.mapRow(row);
  }

  public listAll(): ProviderConfig[] {
    const rows = this.db.prepare('SELECT * FROM provider ORDER BY created_at ASC').all() as any[];
    return rows.map((r) => this.mapRow(r));
  }

  public listEnabled(): ProviderConfig[] {
    const rows = this.db.prepare('SELECT * FROM provider WHERE enabled = 1 ORDER BY created_at ASC').all() as any[];
    return rows.map((r) => this.mapRow(r));
  }

  public setEnabled(id: string, enabled: boolean): void {
    this.db.prepare('UPDATE provider SET enabled = ? WHERE id = ?').run(enabled ? 1 : 0, id);
  }

  public delete(id: string): void {
    this.db.prepare('DELETE FROM provider WHERE id = ?').run(id);
  }

  private mapRow(row: any): ProviderConfig {
    return {
      id: row.id,
      type: row.type,
      display_name: row.display_name,
      base_url: row.base_url || undefined,
      api_key_ref: row.auth_ref || undefined,
      enabled: row.enabled === 1,
      data_use_policy: row.data_use_policy,
      max_concurrency: row.max_concurrency,
      created_at: row.created_at,
    };
  }
}
