import { ISqliteDatabase } from '../db.js';

export interface LocalUsageRecord {
  provider_id: string;
  model_id: string;
  date: string; // YYYY-MM-DD
  requests: number;
  tokens_in: number;
  tokens_out: number;
  active_minutes: number;
}

export class UsageRepository {
  constructor(private db: ISqliteDatabase) {}

  public recordUsage(
    providerId: string,
    modelId: string,
    tokensIn: number,
    tokensOut: number,
    activeMinutes = 0
  ): void {
    const today = new Date().toISOString().split('T')[0];
    this.db.prepare(`
      INSERT INTO usage_local (provider_id, model_id, date, requests, tokens_in, tokens_out, active_minutes)
      VALUES (?, ?, ?, 1, ?, ?, ?)
      ON CONFLICT(provider_id, model_id, date) DO UPDATE SET
        requests = requests + 1,
        tokens_in = tokens_in + excluded.tokens_in,
        tokens_out = tokens_out + excluded.tokens_out,
        active_minutes = active_minutes + excluded.active_minutes
    `).run(providerId, modelId, today, tokensIn, tokensOut, activeMinutes);
  }

  public getDailyUsage(date?: string): LocalUsageRecord[] {
    const targetDate = date || new Date().toISOString().split('T')[0];
    const rows = this.db.prepare('SELECT * FROM usage_local WHERE date = ?').all(targetDate) as any[];
    return rows.map((r) => ({
      provider_id: r.provider_id,
      model_id: r.model_id,
      date: r.date,
      requests: r.requests,
      tokens_in: r.tokens_in,
      tokens_out: r.tokens_out,
      active_minutes: r.active_minutes,
    }));
  }

  public getTotalUsage(): LocalUsageRecord[] {
    const rows = this.db.prepare('SELECT * FROM usage_local ORDER BY date DESC').all() as any[];
    return rows.map((r) => ({
      provider_id: r.provider_id,
      model_id: r.model_id,
      date: r.date,
      requests: r.requests,
      tokens_in: r.tokens_in,
      tokens_out: r.tokens_out,
      active_minutes: r.active_minutes,
    }));
  }
}
