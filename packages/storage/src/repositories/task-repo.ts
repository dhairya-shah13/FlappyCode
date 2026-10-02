import { ISqliteDatabase } from '../db.js';
import { TaskNode } from '@flappycode/protocol';

export interface TaskRunRecord {
  id: string;
  session_id: string;
  prompt: string;
  plan_approved_at: number | null;
  status: string;
}

export class TaskRepository {
  constructor(private db: ISqliteDatabase) {}

  public createTaskRun(id: string, sessionId: string, prompt: string, status = 'created'): void {
    // Upsert: a run id can be re-entered when planning is retried after a
    // pool-exhaustion pause re-plans under the original run id (GAP-002).
    this.db.prepare(`
      INSERT INTO task_run (id, session_id, prompt, plan_approved_at, status)
      VALUES (?, ?, ?, NULL, ?)
      ON CONFLICT(id) DO UPDATE SET
        session_id = excluded.session_id,
        prompt = excluded.prompt,
        status = excluded.status
    `).run(id, sessionId, prompt, status);
  }

  public setPlanApproved(runId: string, timestamp: number = Date.now()): void {
    this.db.prepare('UPDATE task_run SET plan_approved_at = ?, status = ? WHERE id = ?').run(
      timestamp,
      'plan_approved',
      runId
    );
  }

  public setRunStatus(runId: string, status: string): void {
    this.db.prepare('UPDATE task_run SET status = ? WHERE id = ?').run(status, runId);
  }

  public getTaskRun(runId: string): TaskRunRecord | null {
    const row = this.db.prepare('SELECT * FROM task_run WHERE id = ?').get(runId) as any;
    if (!row) return null;
    return {
      id: row.id,
      session_id: row.session_id,
      prompt: row.prompt,
      plan_approved_at: row.plan_approved_at,
      status: row.status,
    };
  }

  public saveTaskNode(runId: string, node: TaskNode): void {
    this.db.prepare(`
      INSERT INTO task_node (
        id, run_id, agent, description, status, depends_on, model_used, substitutions, started_at, ended_at, iterations
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        status = excluded.status,
        model_used = excluded.model_used,
        substitutions = excluded.substitutions,
        started_at = excluded.started_at,
        ended_at = excluded.ended_at,
        iterations = excluded.iterations
    `).run(
      node.id,
      runId,
      node.agent,
      node.description,
      node.status,
      JSON.stringify(node.depends_on),
      node.model_used || null,
      JSON.stringify(node.substitutions),
      node.started_at || null,
      node.ended_at || null,
      node.iterations ?? 0
    );
  }

  public listRunsByStatus(status: string): TaskRunRecord[] {
    const rows = this.db.prepare('SELECT * FROM task_run WHERE status = ? ORDER BY id ASC').all(status) as any[];
    return rows.map((row) => ({
      id: row.id,
      session_id: row.session_id,
      prompt: row.prompt,
      plan_approved_at: row.plan_approved_at,
      status: row.status,
    }));
  }

  public getTaskNodes(runId: string): TaskNode[] {
    const rows = this.db.prepare('SELECT * FROM task_node WHERE run_id = ? ORDER BY started_at ASC').all(
      runId
    ) as any[];

    return rows.map((r) => ({
      id: r.id,
      agent: r.agent,
      description: r.description,
      status: r.status,
      depends_on: JSON.parse(r.depends_on || '[]'),
      model_used: r.model_used || undefined,
      substitutions: JSON.parse(r.substitutions || '[]'),
      tool_calls: [],
      started_at: r.started_at || undefined,
      ended_at: r.ended_at || undefined,
      iterations: r.iterations ?? 0,
    }));
  }
}
