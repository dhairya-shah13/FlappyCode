import type { DatabaseSync } from 'node:sqlite';
import type { Tier } from '@flappycode/protocol';
import type { ModelOverrideRecord, ModelRecord, ProviderRecord } from '../types.js';

export class ProviderRepo {
  constructor(private readonly db: DatabaseSync) {}

  upsert(provider: ProviderRecord): void {
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
        max_concurrency = excluded.max_concurrency;
    `);

    stmt.run(
      provider.id,
      provider.type,
      provider.display_name,
      provider.base_url ?? null,
      provider.auth_ref ?? null,
      provider.enabled,
      provider.data_use_policy ?? null,
      provider.max_concurrency,
      provider.created_at
    );
  }

  get(id: string): ProviderRecord | null {
    const stmt = this.db.prepare('SELECT * FROM provider WHERE id = ?');
    const row = stmt.get(id);
    return (row as unknown as ProviderRecord) || null;
  }

  list(): ProviderRecord[] {
    const stmt = this.db.prepare('SELECT * FROM provider ORDER BY created_at ASC');
    return stmt.all() as unknown as ProviderRecord[];
  }

  delete(id: string): boolean {
    const stmt = this.db.prepare('DELETE FROM provider WHERE id = ?');
    const res = stmt.run(id);
    return (res.changes ?? 0) > 0;
  }

  setEnabled(id: string, enabled: boolean): void {
    const stmt = this.db.prepare('UPDATE provider SET enabled = ? WHERE id = ?');
    stmt.run(enabled ? 1 : 0, id);
  }
}

export class ModelRepo {
  constructor(private readonly db: DatabaseSync) {}

  upsert(model: ModelRecord): void {
    const stmt = this.db.prepare(`
      INSERT INTO model (
        provider_id, model_id, tier, tier_source, context_length, modality,
        supports_tools, supports_vision, tool_probe_passed, price_in, price_out,
        avg_latency_ms, last_validated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(provider_id, model_id) DO UPDATE SET
        tier = excluded.tier,
        tier_source = excluded.tier_source,
        context_length = excluded.context_length,
        modality = excluded.modality,
        supports_tools = excluded.supports_tools,
        supports_vision = excluded.supports_vision,
        tool_probe_passed = excluded.tool_probe_passed,
        price_in = excluded.price_in,
        price_out = excluded.price_out,
        avg_latency_ms = excluded.avg_latency_ms,
        last_validated_at = excluded.last_validated_at;
    `);

    stmt.run(
      model.provider_id,
      model.model_id,
      model.tier,
      model.tier_source,
      model.context_length,
      model.modality,
      model.supports_tools,
      model.supports_vision,
      model.tool_probe_passed ?? null,
      model.price_in,
      model.price_out,
      model.avg_latency_ms,
      model.last_validated_at
    );
  }

  get(providerId: string, modelId: string): ModelRecord | null {
    const stmt = this.db.prepare('SELECT * FROM model WHERE provider_id = ? AND model_id = ?');
    const row = stmt.get(providerId, modelId);
    return (row as unknown as ModelRecord) || null;
  }

  listByProvider(providerId: string): ModelRecord[] {
    const stmt = this.db.prepare('SELECT * FROM model WHERE provider_id = ? ORDER BY model_id ASC');
    return stmt.all(providerId) as unknown as ModelRecord[];
  }

  listByTier(tier: Tier): ModelRecord[] {
    const stmt = this.db.prepare('SELECT * FROM model WHERE tier = ? ORDER BY provider_id, model_id');
    return stmt.all(tier) as unknown as ModelRecord[];
  }

  listAll(): ModelRecord[] {
    const stmt = this.db.prepare('SELECT * FROM model ORDER BY provider_id, model_id');
    return stmt.all() as unknown as ModelRecord[];
  }

  setOverride(override: ModelOverrideRecord): void {
    const stmt = this.db.prepare(`
      INSERT INTO model_override (provider_id, model_id, tier, created_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(provider_id, model_id) DO UPDATE SET
        tier = excluded.tier,
        created_at = excluded.created_at;
    `);
    stmt.run(override.provider_id, override.model_id, override.tier, override.created_at);
  }

  getOverride(providerId: string, modelId: string): ModelOverrideRecord | null {
    const stmt = this.db.prepare('SELECT * FROM model_override WHERE provider_id = ? AND model_id = ?');
    const row = stmt.get(providerId, modelId);
    return (row as unknown as ModelOverrideRecord) || null;
  }
}
