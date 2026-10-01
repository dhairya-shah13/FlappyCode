import { FileDiff } from '@flappycode/protocol';
import { Palette } from '../palette.js';

export class DiffReviewScreen {
  public static render(diffs: FileDiff[], width = 80): string {
    const boxRule = '─'.repeat(Math.max(20, width - 4));
    let content = `╭─ ${Palette.bold('Review changes')} ── ${diffs.length} files ${boxRule.slice(25)}╮\n`;

    for (const diff of diffs) {
      content += `│ ${Palette.cyan(Palette.bold(diff.path))}\n`;
      for (const hunk of diff.hunks) {
        content += `│  ${Palette.dim(`@@ -${hunk.oldStart},${hunk.oldLines} +${hunk.newStart},${hunk.newLines} @@`)}\n`;
        for (const line of hunk.lines.slice(0, 10)) {
          if (line.startsWith('+')) {
            content += `│ ${Palette.ok(line.slice(0, width - 4))}\n`;
          } else if (line.startsWith('-')) {
            content += `│ ${Palette.error(line.slice(0, width - 4))}\n`;
          } else {
            content += `│  ${line.slice(0, width - 5)}\n`;
          }
        }
      }
    }

    content += `│                                                                              │\n`;
    content += `│  ${Palette.ok('a Apply all')}   ${Palette.dim('y Apply hunk   n Skip hunk   Esc Back')}              │\n`;
    content += `╰${boxRule}╯\n`;
    return content;
  }
}
