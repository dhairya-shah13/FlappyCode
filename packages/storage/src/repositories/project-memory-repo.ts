import { ISqliteDatabase } from '../db.js';

export interface ProjectMemoryEntry {
  project_path: string;
  key: string;
  value: string;
  updated_at: number;
}

export class ProjectMemoryRepository {
  constructor(private db: ISqliteDatabase) {}

  public get(projectPath: string, key: string): string | undefined {
    const row = this.db
      .prepare('SELECT value FROM project_memory WHERE project_path = ? AND key = ?')
      .get(projectPath, key) as any;
    return row?.value ?? undefined;
  }

  public set(projectPath: string, key: string, value: string): void {
    this.db
      .prepare(
        `INSERT INTO project_memory (project_path, key, value, updated_at)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(project_path, key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
      )
      .run(projectPath, key, value, Date.now());
  }

  public delete(projectPath: string, key: string): void {
    this.db
      .prepare('DELETE FROM project_memory WHERE project_path = ? AND key = ?')
      .run(projectPath, key);
  }

  public listKeys(projectPath: string): ProjectMemoryEntry[] {
    const rows = this.db
      .prepare('SELECT * FROM project_memory WHERE project_path = ? ORDER BY key ASC')
      .all(projectPath) as any[];
    return rows.map((r) => ({
      project_path: r.project_path,
      key: r.key,
      value: r.value,
      updated_at: r.updated_at,
    }));
  }
}
