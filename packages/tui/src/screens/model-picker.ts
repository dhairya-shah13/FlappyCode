import { Model } from '@flappycode/protocol';
import { Palette } from '../palette.js';

export class ModelPickerScreen {
  public static render(models: Model[], selectedIndex = 0, width = 80): string {
    const boxRule = '─'.repeat(Math.max(20, width - 4));
    let content = `╭─ ${Palette.bold('Choose model')} ${boxRule.slice(14)}╮\n`;

    // Row 0: ALWAYS flappyauto per FR-ORC-001
    const isAutoSelected = selectedIndex === 0;
    const autoPrefix = isAutoSelected ? Palette.cyan('▸ ⚡ flappyauto') : '   ⚡ flappyauto';
    content += `│ ${autoPrefix.padEnd(25)} Multi-agent orchestration · picks best free model     │\n`;
    content += `│                            per task                              ${Palette.ok('[DEFAULT]')}      │\n`;
    content += `│ ${'─'.repeat(Math.max(20, width - 6))} │\n`;

    const freeModels = models.filter((m) => m.tier === 'free' || m.tier === 'rate_limited_free');
    const paidModels = models.filter((m) => m.tier === 'paid');

    content += `│   ${Palette.bold('FREE')}                                                                          │\n`;
    freeModels.forEach((m, idx) => {
      const isSelected = selectedIndex === idx + 1;
      const marker = isSelected ? Palette.cyan('▸ ● ') : '  ● ';
      const tag = m.is_local ? Palette.ok('local') : Palette.subtle('free');
      const warning = m.data_use_policy === 'trains_on_prompts' ? Palette.yellow('⚠ trains') : '';
      const name = `${m.provider_id}/${m.model_id}`.slice(0, 35);
      content += `│ ${marker}${name.padEnd(36)} ${(m.context_length / 1024).toFixed(0)}k  tools   ${tag}  ${warning} │\n`;
    });

    if (paidModels.length > 0) {
      content += `│   ${Palette.dim('PAID (never used unless you pick or approve)')}                                   │\n`;
      paidModels.slice(0, 3).forEach((m, idx) => {
        const isSelected = selectedIndex === freeModels.length + 1 + idx;
        const marker = isSelected ? Palette.cyan('▸ ○ ') : '  ○ ';
        const name = `${m.provider_id}/${m.model_id}`.slice(0, 35);
        content += `│ ${marker}${name.padEnd(36)} ${(m.context_length / 1024).toFixed(0)}k  tools   ${Palette.orange('$$')}                          │\n`;
      });
    }

    content += `│ ${Palette.dim('↑↓ move  ↵ select  Tab: bind to agent…  f: free only  Esc')}                       │\n`;
    content += `╰${boxRule}╯\n`;
    return content;
  }
}
