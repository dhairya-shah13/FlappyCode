import type { DatabaseSync } from 'node:sqlite';
import type { MessageRecord, SessionRecord } from '../types.js';

export class SessionRepo {
  constructor(private readonly db: DatabaseSync) {}

  create(session: SessionRecord): void {
    const stmt = this.db.prepare(`
      INSERT INTO session (id, project_path, created_at, updated_at, summary)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        project_path = excluded.project_path,
        updated_at = excluded.updated_at,
        summary = excluded.summary;
    `);
    stmt.run(
      session.id,
      session.project_path,
      session.created_at,
      session.updated_at,
      session.summary ?? null
    );
  }

  get(id: string): SessionRecord | null {
    const stmt = this.db.prepare('SELECT * FROM session WHERE id = ?');
    const row = stmt.get(id);
    return (row as unknown as SessionRecord) || null;
  }

  list(projectPath?: string): SessionRecord[] {
    if (projectPath) {
      const stmt = this.db.prepare('SELECT * FROM session WHERE project_path = ? ORDER BY updated_at DESC');
      return stmt.all(projectPath) as unknown as SessionRecord[];
    }
    const stmt = this.db.prepare('SELECT * FROM session ORDER BY updated_at DESC');
    return stmt.all() as unknown as SessionRecord[];
  }

  updateSummary(id: string, summary: string): void {
    const stmt = this.db.prepare('UPDATE session SET summary = ?, updated_at = ? WHERE id = ?');
    stmt.run(summary, Date.now(), id);
  }
}

export class MessageRepo {
  constructor(private readonly db: DatabaseSync) {}

  append(message: Omit<MessageRecord, 'id'>): MessageRecord {
    const stmt = this.db.prepare(`
      INSERT INTO message (session_id, role, content, created_at)
      VALUES (?, ?, ?, ?)
    `);
    const res = stmt.run(message.session_id, message.role, message.content, message.created_at);
    const lastId = Number(res.lastInsertRowid);
    return {
      id: lastId,
      ...message,
    };
  }

  listBySession(sessionId: string): MessageRecord[] {
    const stmt = this.db.prepare('SELECT * FROM message WHERE session_id = ? ORDER BY id ASC');
    return stmt.all(sessionId) as unknown as MessageRecord[];
  }
}
