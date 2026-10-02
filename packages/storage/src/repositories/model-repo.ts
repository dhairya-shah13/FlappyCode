import { ISqliteDatabase } from '../db.js';
import { Model, ModelOverride, ModelTier } from '@flappycode/protocol';

export class ModelRepository {
  constructor(private db: ISqliteDatabase) {}

  public saveModel(model: Model): void {
    const stmt = this.db.prepare(`
      INSERT INTO model (
        provider_id, model_id, tier, tier_source, context_length, modality,
        supports_tools, supports_vision, tool_probe_passed, price_in, price_out,
        avg_latency_ms, last_validated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
        last_validated_at = excluded.last_validated_at
    `);

    stmt.run(
      model.provider_id,
      model.model_id,
      model.tier,
      model.tier_source,
      model.context_length,
      model.modality,
      model.supports_tools ? 1 : 0,
      model.supports_vision ? 1 : 0,
      model.tool_probe_passed === null ? null : model.tool_probe_passed ? 1 : 0,
      model.price_in,
      model.price_out,
      model.avg_latency_ms,
      model.last_validated_at
    );
  }

  public getModel(providerId: string, modelId: string): Model | null {
    const row = this.db.prepare(`
      SELECT m.*, p.data_use_policy, p.type as provider_type
      FROM model m
      JOIN provider p ON m.provider_id = p.id
      WHERE m.provider_id = ? AND m.model_id = ?
    `).get(providerId, modelId) as any;

    if (!row) return null;
    return this.mapRow(row);
  }

  public listModels(filters?: {
    providerId?: string;
    tier?: ModelTier;
    tiers?: ModelTier[];
    minContext?: number;
    tools?: boolean;
    vision?: boolean;
    enabledProvidersOnly?: boolean;
    /** FR-MOD-003: filter by modality (exact match, e.g. 'text->text'). */
    modality?: string;
    /** FR-MOD-003: filter by measured latency ceiling. */
    maxLatencyMs?: number;
    /** FR-MOD-003: filter by cost ceilings (price per 1M tokens). */
    maxPriceIn?: number;
    maxPriceOut?: number;
  }): Model[] {
    let sql = `
      SELECT m.*, p.data_use_policy, p.type as provider_type
      FROM model m
      JOIN provider p ON m.provider_id = p.id
      WHERE 1=1
    `;
    const params: any[] = [];

    if (filters?.enabledProvidersOnly !== false) {
      sql += ' AND p.enabled = 1';
    }

    if (filters?.providerId) {
      sql += ' AND m.provider_id = ?';
      params.push(filters.providerId);
    }

    if (filters?.tier) {
      sql += ' AND m.tier = ?';
      params.push(filters.tier);
    } else if (filters?.tiers && filters.tiers.length > 0) {
      sql += ` AND m.tier IN (${filters.tiers.map(() => '?').join(',')})`;
      params.push(...filters.tiers);
    }

    if (filters?.minContext) {
      sql += ' AND m.context_length >= ?';
      params.push(filters.minContext);
    }

    if (filters?.tools) {
      sql += ' AND m.supports_tools = 1';
    }

    if (filters?.vision) {
      sql += ' AND m.supports_vision = 1';
    }

    if (filters?.modality) {
      sql += ' AND m.modality = ?';
      params.push(filters.modality);
    }

    if (filters?.maxLatencyMs !== undefined) {
      sql += ' AND m.avg_latency_ms <= ?';
      params.push(filters.maxLatencyMs);
    }

    if (filters?.maxPriceIn !== undefined) {
      sql += ' AND m.price_in <= ?';
      params.push(filters.maxPriceIn);
    }

    if (filters?.maxPriceOut !== undefined) {
      sql += ' AND m.price_out <= ?';
      params.push(filters.maxPriceOut);
    }

    sql += ' ORDER BY m.tier ASC, m.context_length DESC';

    const rows = this.db.prepare(sql).all(...params) as any[];
    return rows.map((r) => this.mapRow(r));
  }

  public countFreeAvailableModels(): number {
    const row = this.db.prepare(`
      SELECT COUNT(*) as count
      FROM model m
      JOIN provider p ON m.provider_id = p.id
      WHERE p.enabled = 1
        AND m.tier IN ('free', 'rate_limited_free')
    `).get() as { count: number };
    return row.count;
  }

  public markUnavailable(providerId: string, modelId: string): void {
    this.db.prepare(`
      UPDATE model
      SET tier = 'unavailable', last_validated_at = ?
      WHERE provider_id = ? AND model_id = ?
    `).run(Date.now(), providerId, modelId);
  }

  public saveOverride(override: ModelOverride): void {
    this.db.prepare(`
      INSERT INTO model_override (provider_id, model_id, tier, created_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(provider_id, model_id) DO UPDATE SET
        tier = excluded.tier
    `).run(override.provider_id, override.model_id, override.tier, override.created_at);

    // Also update model table if present
    this.db.prepare(`
      UPDATE model
      SET tier = ?, tier_source = 'override'
      WHERE provider_id = ? AND model_id = ?
    `).run(override.tier, override.provider_id, override.model_id);
  }

  public getOverride(providerId: string, modelId: string): ModelOverride | null {
    const row = this.db.prepare('SELECT * FROM model_override WHERE provider_id = ? AND model_id = ?').get(
      providerId,
      modelId
    ) as any;
    if (!row) return null;
    return {
      provider_id: row.provider_id,
      model_id: row.model_id,
      tier: row.tier,
      created_at: row.created_at,
    };
  }

  public listOverrides(): ModelOverride[] {
    const rows = this.db.prepare('SELECT * FROM model_override').all() as any[];
    return rows.map((r) => ({
      provider_id: r.provider_id,
      model_id: r.model_id,
      tier: r.tier,
      created_at: r.created_at,
    }));
  }

  public deleteOverride(providerId: string, modelId: string): void {
    this.db.prepare('DELETE FROM model_override WHERE provider_id = ? AND model_id = ?').run(
      providerId,
      modelId
    );
  }

  private mapRow(row: any): Model {
    const isLocal =
      (row.provider_type === 'ollama' && row.provider_id !== 'ollama-cloud' && row.provider_type !== 'ollama-cloud') ||
      row.provider_type === 'lm-studio' ||
      row.provider_type === 'llama-cpp';

    return {
      provider_id: row.provider_id,
      model_id: row.model_id,
      tier: row.tier,
      tier_source: row.tier_source,
      context_length: row.context_length,
      modality: row.modality,
      supports_tools: row.supports_tools === 1,
      supports_vision: row.supports_vision === 1,
      tool_probe_passed:
        row.tool_probe_passed === null ? null : row.tool_probe_passed === 1,
      price_in: row.price_in,
      price_out: row.price_out,
      avg_latency_ms: row.avg_latency_ms,
      last_validated_at: row.last_validated_at,
      data_use_policy: row.data_use_policy || 'unknown',
      is_local: isLocal,
      is_pinned: false,
    };
  }
}
