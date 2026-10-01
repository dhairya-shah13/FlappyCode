import { FsJail } from './fs-jail.js';

export interface UndoBatch {
  id: string;
  runId: string;
  timestamp: number;
  files: Array<{
    path: string;
    priorContent: string | null; // null if newly created file
  }>;
}

export class UndoEngine {
  private batches: UndoBatch[] = [];

  constructor(private fsJail: FsJail) {}

  public recordBeforeChange(runId: string, affectedPaths: string[]): UndoBatch {
    const files = affectedPaths.map((p) => {
      let priorContent: string | null = null;
      if (this.fsJail.exists(p)) {
        priorContent = this.fsJail.readFile(p);
      }
      return { path: p, priorContent };
    });

    const batch: UndoBatch = {
      id: `undo_${Date.now()}`,
      runId,
      timestamp: Date.now(),
      files,
    };
    this.batches.push(batch);
    return batch;
  }

  public undoLatest(): { success: boolean; restoredFiles: string[]; error?: string } {
    if (this.batches.length === 0) {
      return { success: false, restoredFiles: [], error: 'No change batches available to undo.' };
    }

    const batch = this.batches.pop()!;
    const restored: string[] = [];

    try {
      for (const file of batch.files) {
        if (file.priorContent === null) {
          // File was newly created in this batch, delete it on undo
          this.fsJail.deleteFile(file.path);
          restored.push(file.path);
        } else {
          // Restore prior content
          this.fsJail.writeFile(file.path, file.priorContent, undefined, true);
          restored.push(file.path);
        }
      }
      return { success: true, restoredFiles: restored };
    } catch (err: any) {
      return { success: false, restoredFiles: restored, error: `Undo failed: ${err.message}` };
    }
  }

  public getHistory(): UndoBatch[] {
    return [...this.batches];
  }
}
