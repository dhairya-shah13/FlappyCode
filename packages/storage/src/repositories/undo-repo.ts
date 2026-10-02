import { ISqliteDatabase } from '../db.js';

export interface PersistedUndoFile {
  id?: number;
  batch_id: string;
  file_path: string;
  original_content: string | null;
  new_content: string | null;
  hunks_applied: string | null;
}

export interface PersistedUndoBatch {
  id: string;
  session_id: string | null;
  description: string;
  applied_at: number;
  reverted_at: number | null;
  git_commit_sha: string | null;
  files: PersistedUndoFile[];
}

export class UndoRepository {
  constructor(private db: ISqliteDatabase) {}

  public saveBatch(batch: {
    id: string;
    sessionId?: string | null;
    description: string;
    gitCommitSha?: string | null;
    appliedAt?: number;
    files: Array<{
      filePath: string;
      originalContent: string | null;
      newContent?: string | null;
      hunksApplied?: string | null;
    }>;
  }): void {
    const appliedAt = batch.appliedAt || Date.now();

    const insertBatch = this.db.prepare(`
      INSERT INTO undo_batch (id, session_id, description, applied_at, reverted_at, git_commit_sha)
      VALUES (?, ?, ?, ?, NULL, ?)
      ON CONFLICT(id) DO UPDATE SET
        session_id = excluded.session_id,
        description = excluded.description,
        applied_at = excluded.applied_at,
        git_commit_sha = excluded.git_commit_sha
    `);

    insertBatch.run(
      batch.id,
      batch.sessionId || null,
      batch.description,
      appliedAt,
      batch.gitCommitSha || null
    );

    // Delete existing files if re-saving batch
    this.db.prepare('DELETE FROM undo_file WHERE batch_id = ?').run(batch.id);

    const insertFile = this.db.prepare(`
      INSERT INTO undo_file (batch_id, file_path, original_content, new_content, hunks_applied)
      VALUES (?, ?, ?, ?, ?)
    `);

    for (const f of batch.files) {
      insertFile.run(
        batch.id,
        f.filePath,
        f.originalContent,
        f.newContent || null,
        f.hunksApplied || null
      );
    }
  }

  public getLatestActiveBatch(): PersistedUndoBatch | null {
    const row = this.db
      .prepare('SELECT * FROM undo_batch WHERE reverted_at IS NULL ORDER BY applied_at DESC LIMIT 1')
      .get() as any;
    if (!row) return null;
    return this.loadFilesForBatch(row);
  }

  public getBatch(id: string): PersistedUndoBatch | null {
    const row = this.db.prepare('SELECT * FROM undo_batch WHERE id = ?').get(id) as any;
    if (!row) return null;
    return this.loadFilesForBatch(row);
  }

  public listBatches(limit = 20): PersistedUndoBatch[] {
    const rows = this.db
      .prepare('SELECT * FROM undo_batch ORDER BY applied_at DESC LIMIT ?')
      .all(limit) as any[];
    return rows.map((r) => this.loadFilesForBatch(r));
  }

  public markReverted(id: string): void {
    this.db.prepare('UPDATE undo_batch SET reverted_at = ? WHERE id = ?').run(Date.now(), id);
  }

  public deleteBatch(id: string): void {
    this.db.prepare('DELETE FROM undo_batch WHERE id = ?').run(id);
  }

  private loadFilesForBatch(row: any): PersistedUndoBatch {
    const fileRows = this.db
      .prepare('SELECT * FROM undo_file WHERE batch_id = ? ORDER BY id ASC')
      .all(row.id) as any[];

    const files: PersistedUndoFile[] = fileRows.map((f) => ({
      id: f.id,
      batch_id: f.batch_id,
      file_path: f.file_path,
      original_content: f.original_content,
      new_content: f.new_content,
      hunks_applied: f.hunks_applied,
    }));

    return {
      id: row.id,
      session_id: row.session_id,
      description: row.description,
      applied_at: row.applied_at,
      reverted_at: row.reverted_at,
      git_commit_sha: row.git_commit_sha,
      files,
    };
  }
}
