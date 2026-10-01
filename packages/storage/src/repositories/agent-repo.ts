import { ISqliteDatabase } from '../db.js';
import { AgentDefinition } from '@flappycode/protocol';

/**
 * Persistence for agent definitions and per-agent model bindings
 * (FR-ORC-004 `agents bind`, FR-ORC-006 `agent_definition` table).
 */
export class AgentRepository {
  constructor(private db: ISqliteDatabase) {}

  public upsert(def: AgentDefinition): void {
    this.db.prepare(`
      INSERT INTO agent_definition (name, system_prompt, allowed_tools, preferred_model_ref, fallback_policy)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(name) DO UPDATE SET
        system_prompt = excluded.system_prompt,
        allowed_tools = excluded.allowed_tools,
        preferred_model_ref = excluded.preferred_model_ref,
        fallback_policy = excluded.fallback_policy
    `).run(
      def.name,
      def.system_prompt,
      JSON.stringify(def.allowed_tools),
      def.preferred_model_ref,
      def.fallback_policy
    );
  }

  public get(name: string): AgentDefinition | null {
    const row = this.db.prepare('SELECT * FROM agent_definition WHERE name = ?').get(name) as any;
    if (!row) return null;
    return this.mapRow(row);
  }

  public list(): AgentDefinition[] {
    const rows = this.db.prepare('SELECT * FROM agent_definition ORDER BY name ASC').all() as any[];
    return rows.map((r) => this.mapRow(r));
  }

  /** Persist only the model binding, preserving other definition fields. */
  public setBinding(name: string, modelId: string, base?: AgentDefinition): boolean {
    const existing = this.get(name);
    const source = existing || base;
    if (!source) return false;
    this.upsert({ ...source, name, preferred_model_ref: modelId });
    return true;
  }

  public clearBinding(name: string): void {
    const existing = this.get(name);
    if (existing) {
      this.upsert({ ...existing, preferred_model_ref: 'flappyauto' });
    }
  }

  public delete(name: string): void {
    this.db.prepare('DELETE FROM agent_definition WHERE name = ?').run(name);
  }

  private mapRow(row: any): AgentDefinition {
    return {
      name: row.name,
      system_prompt: row.system_prompt,
      allowed_tools: JSON.parse(row.allowed_tools || '[]'),
      preferred_model_ref: row.preferred_model_ref || 'flappyauto',
      fallback_policy: row.fallback_policy || 'ask_user',
    };
  }
}
