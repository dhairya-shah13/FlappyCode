import * as Diff from 'diff';
import { DiffHunk, FileDiff } from '@flappycode/protocol';

export class DiffEngine {
  public static createUnifiedDiff(
    filePath: string,
    oldContent: string | null,
    newContent: string | null
  ): FileDiff {
    const isNew = oldContent === null;
    const isDeleted = newContent === null;
    const oldStr = oldContent || '';
    const newStr = newContent || '';

    const patch = Diff.createPatch(filePath, oldStr, newStr, 'a/' + filePath, 'b/' + filePath);
    const parsedPatches = Diff.parsePatch(patch);
    const firstPatch = parsedPatches[0];

    const hunks: DiffHunk[] = (firstPatch?.hunks || []).map((h) => ({
      oldStart: h.oldStart,
      oldLines: h.oldLines,
      newStart: h.newStart,
      newLines: h.newLines,
      lines: h.lines,
    }));

    return {
      path: filePath,
      oldContent,
      newContent,
      isNew,
      isDeleted,
      hunks,
      unifiedDiff: patch,
    };
  }

  public static applyHunks(
    oldContent: string,
    hunks: DiffHunk[],
    selectedIndices?: number[]
  ): string {
    if (selectedIndices === undefined || selectedIndices.length === hunks.length) {
      // Apply all hunks
      const patchObj = {
        oldHeader: 'old',
        newHeader: 'new',
        hunks: hunks.map((h) => ({
          oldStart: h.oldStart,
          oldLines: h.oldLines,
          newStart: h.newStart,
          newLines: h.newLines,
          lines: h.lines,
          linedelimiters: h.lines.map(() => '\n'),
        })),
      };
      return Diff.applyPatch(oldContent, patchObj as any) || oldContent;
    }

    const filteredHunks = hunks.filter((_, idx) => selectedIndices.includes(idx));
    const patchObj = {
      oldHeader: 'old',
      newHeader: 'new',
      hunks: filteredHunks.map((h) => ({
        oldStart: h.oldStart,
        oldLines: h.oldLines,
        newStart: h.newStart,
        newLines: h.newLines,
        lines: h.lines,
        linedelimiters: h.lines.map(() => '\n'),
      })),
    };
    return Diff.applyPatch(oldContent, patchObj as any) || oldContent;
  }
}
