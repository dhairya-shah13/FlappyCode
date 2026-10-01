import { ISqliteDatabase } from '../db.js';
import { ToolCallRecord } from '@flappycode/protocol';

export class AuditRepository {
  constructor(private db: ISqliteDatabase) {}

  public logToolCall(nodeId: string, record: ToolCallRecord): void {
    this.db.prepare(`
      INSERT INTO tool_call_log (node_id, tool, args, result_summary, approved_by_user, ts)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      nodeId,
      record.tool,
      JSON.stringify(record.args),
      record.result_summary || null,
      record.approved_by_user ? 1 : 0,
      record.timestamp || Date.now()
    );
  }

  public listToolCalls(nodeId?: string): ToolCallRecord[] {
    let sql = 'SELECT * FROM tool_call_log';
    const params: any[] = [];
    if (nodeId) {
      sql += ' WHERE node_id = ?';
      params.push(nodeId);
    }
    sql += ' ORDER BY ts ASC';

    const rows = this.db.prepare(sql).all(...params) as any[];
    return rows.map((r) => ({
      id: String(r.id),
      tool: r.tool,
      args: JSON.parse(r.args || '{}'),
      result_summary: r.result_summary || undefined,
      approved_by_user: r.approved_by_user === 1,
      timestamp: r.ts,
    }));
  }
}
