import { Palette } from '../palette.js';

export interface PermissionPromptOptions {
  agent: string;
  command: string;
  cwd?: string;
  isDestructive?: boolean;
  reason?: string;
  width?: number;
}

export class PermissionPromptScreen {
  public static render(opts: PermissionPromptOptions): string {
    const width = opts.width || 80;
    const boxRule = '─'.repeat(Math.max(20, width - 4));
    const title = opts.isDestructive
      ? Palette.error(Palette.bold('⚠ Destructive Command Permission Needed'))
      : Palette.bold('Permission Needed');

    let content = `╭─ ${title} ${boxRule.slice(opts.isDestructive ? 44 : 22)}╮\n`;
    content += `│ ${Palette.cyan(opts.agent)} wants to run: ${opts.command.slice(0, width - 25)}\n`;
    if (opts.cwd) {
      content += `│ Directory: ${opts.cwd.slice(0, 40)}   Risk: ${opts.isDestructive ? Palette.error('HIGH (destructive)') : 'normal'}\n`;
    }
    if (opts.reason) {
      content += `│ Reason: ${opts.reason.slice(0, width - 12)}\n`;
    }
    content += `│\n`;
    if (opts.isDestructive) {
      content += `│  ${Palette.ok('[ y Allow once ]')}    ${Palette.error('[ n Deny ]')}  (Destructive commands cannot be permanently allowed)\n`;
    } else {
      content += `│  ${Palette.ok('[ y Allow once ]')}   ${Palette.cyan('[ a Always allow for this project ]')}   ${Palette.error('[ n Deny ]')}\n`;
    }
    content += `╰${boxRule}╯\n`;
    return content;
  }
}
