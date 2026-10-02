import { FsJail } from './fs-jail.js';
import { UndoRepository, PersistedUndoBatch } from '@flappycode/storage';

export interface UndoBatch {
  id: string;
  runId: string;
  timestamp: number;
  files: Array<{
    path: string;
    priorContent: string | null; // null if newly created file
    newContent?: string | null;
    hunksApplied?: string | null;
  }>;
}

export class UndoEngine {
  private batches: UndoBatch[] = [];

  constructor(
    private fsJail: FsJail,
    private repo?: UndoRepository
  ) {}

  public recordBeforeChange(
    runId: string,
    affectedPaths: string[],
    newContents?: Map<string, string>,
    hunksApplied?: Map<string, string>
  ): UndoBatch {
    const files = affectedPaths.map((p) => {
      let priorContent: string | null = null;
      if (this.fsJail.exists(p)) {
        priorContent = this.fsJail.readFile(p);
      }
      return {
        path: p,
        priorContent,
        newContent: newContents?.get(p) ?? null,
        hunksApplied: hunksApplied?.get(p) ?? null,
      };
    });

    const batch: UndoBatch = {
      id: `undo_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      runId,
      timestamp: Date.now(),
      files,
    };

    this.batches.push(batch);

    if (this.repo) {
      try {
        this.repo.saveBatch({
          id: batch.id,
          sessionId: runId,
          description: `Edit batch for run ${runId}`,
          appliedAt: batch.timestamp,
          files: files.map((f) => ({
            filePath: f.path,
            originalContent: f.priorContent,
            newContent: f.newContent,
            hunksApplied: f.hunksApplied,
          })),
        });
      } catch {
        // In-memory fallback remains intact if SQLite is unavailable
      }
    }

    return batch;
  }

  public undoLatest(): { success: boolean; restoredFiles: string[]; error?: string } {
    // 1. Try persistent repository first if available (survives restart - GAP-045)
    if (this.repo) {
      const persisted = this.repo.getLatestActiveBatch();
      if (persisted) {
        const restored: string[] = [];
        try {
          for (const file of persisted.files) {
            if (file.original_content === null) {
              if (this.fsJail.exists(file.file_path)) {
                this.fsJail.deleteFile(file.file_path);
              }
              restored.push(file.file_path);
            } else {
              this.fsJail.writeFile(file.file_path, file.original_content, undefined, true);
              restored.push(file.file_path);
            }
          }
          this.repo.markReverted(persisted.id);
          // Also pop in-memory if matching
          if (this.batches.length > 0 && this.batches[this.batches.length - 1].id === persisted.id) {
            this.batches.pop();
          }
          return { success: true, restoredFiles: restored };
        } catch (err: any) {
          return { success: false, restoredFiles: restored, error: `Undo failed: ${err.message}` };
        }
      }
    }

    // 2. Fall back to process-local batches
    if (this.batches.length === 0) {
      return { success: false, restoredFiles: [], error: 'No change batches available to undo.' };
    }

    const batch = this.batches.pop()!;
    const restored: string[] = [];

    try {
      for (const file of batch.files) {
        if (file.priorContent === null) {
          if (this.fsJail.exists(file.path)) {
            this.fsJail.deleteFile(file.path);
          }
          restored.push(file.path);
        } else {
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
    if (this.repo) {
      try {
        const persistedList = this.repo.listBatches(50);
        if (persistedList.length > 0) {
          return persistedList.map((p) => ({
            id: p.id,
            runId: p.session_id || 'unknown',
            timestamp: p.applied_at,
            files: p.files.map((f) => ({
              path: f.file_path,
              priorContent: f.original_content,
              newContent: f.new_content,
              hunksApplied: f.hunks_applied,
            })),
          }));
        }
      } catch {
        // Fall back to memory
      }
    }
    return [...this.batches];
  }
}
