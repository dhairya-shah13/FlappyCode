import { Palette } from '../palette.js';

export class PoolExhaustedScreen {
  public static render(connectedProviders = 1, width = 80): string {
    const boxRule = '─'.repeat(Math.max(20, width - 4));
    let content = `╭─ ${Palette.error(Palette.bold('Free model pool exhausted'))} ${boxRule.slice(28)}╮\n`;
    content += `│ Every free model across your ${connectedProviders} connected provider(s) is unavailable right now │\n`;
    content += `│ (rate-limited or out of quota). ${Palette.bold('No paid model has been used.')}                 │\n`;
    content += `│                                                                              │\n`;
    content += `│  ${Palette.cyan('▸ 1  Add credit on a paid-capable provider     (opens billing)')}          │\n`;
    content += `│    2  Connect another free-tier provider                                     │\n`;
    content += `│                                                                              │\n`;
    content += `│  ${Palette.dim('Task paused — it will resume after you choose.        Esc: keep paused')}      │\n`;
    content += `╰${boxRule}╯\n`;
    return content;
  }
}
