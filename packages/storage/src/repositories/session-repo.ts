import { ISqliteDatabase } from '../db.js';

export interface SessionRecord {
  id: string;
  project_path: string;
  created_at: number;
  updated_at: number;
  summary?: string;
}

export interface MessageRecord {
  id?: number;
  session_id: string;
  role: string;
  content: string;
  created_at: number;
}

export class SessionRepository {
  constructor(private db: ISqliteDatabase) {}

  public createSession(id: string, projectPath: string, summary?: string): SessionRecord {
    const now = Date.now();
    this.db.prepare(`
      INSERT INTO session (id, project_path, created_at, updated_at, summary)
      VALUES (?, ?, ?, ?, ?)
    `).run(id, projectPath, now, now, summary || null);

    return {
      id,
      project_path: projectPath,
      created_at: now,
      updated_at: now,
      summary,
    };
  }

  public getSession(id: string): SessionRecord | null {
    const row = this.db.prepare('SELECT * FROM session WHERE id = ?').get(id) as any;
    if (!row) return null;
    return {
      id: row.id,
      project_path: row.project_path,
      created_at: row.created_at,
      updated_at: row.updated_at,
      summary: row.summary || undefined,
    };
  }

  public listSessions(projectPath?: string): SessionRecord[] {
    let sql = 'SELECT * FROM session';
    const params: any[] = [];
    if (projectPath) {
      sql += ' WHERE project_path = ?';
      params.push(projectPath);
    }
    sql += ' ORDER BY updated_at DESC';

    const rows = this.db.prepare(sql).all(...params) as any[];
    return rows.map((r) => ({
      id: r.id,
      project_path: r.project_path,
      created_at: r.created_at,
      updated_at: r.updated_at,
      summary: r.summary || undefined,
    }));
  }

  public updateSessionSummary(id: string, summary: string): void {
    this.db.prepare('UPDATE session SET summary = ?, updated_at = ? WHERE id = ?').run(
      summary,
      Date.now(),
      id
    );
  }

  public deleteSession(id: string): void {
    this.db.prepare('DELETE FROM session WHERE id = ?').run(id);
  }

  public addMessage(sessionId: string, role: string, content: string): MessageRecord {
    const now = Date.now();
    const result = this.db.prepare(`
      INSERT INTO message (session_id, role, content, created_at)
      VALUES (?, ?, ?, ?)
    `).run(sessionId, role, content, now);

    this.db.prepare('UPDATE session SET updated_at = ? WHERE id = ?').run(now, sessionId);

    return {
      id: Number(result.lastInsertRowid),
      session_id: sessionId,
      role,
      content,
      created_at: now,
    };
  }

  public getMessages(sessionId: string): MessageRecord[] {
    const rows = this.db.prepare('SELECT * FROM message WHERE session_id = ? ORDER BY id ASC').all(
      sessionId
    ) as any[];
    return rows.map((r) => ({
      id: r.id,
      session_id: r.session_id,
      role: r.role,
      content: r.content,
      created_at: r.created_at,
    }));
  }
}
