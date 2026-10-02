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
      const overrideTag = m.tier_source === 'override' ? Palette.cyan(' [override]') : '';
      const warning = m.data_use_policy === 'trains_on_prompts' ? Palette.yellow('⚠ trains') : '';
      const name = `${m.provider_id}/${m.model_id}`.slice(0, 35);
      content += `│ ${marker}${name.padEnd(34)} ${(m.context_length / 1024).toFixed(0)}k  tools   ${tag}${overrideTag}  ${warning} │\n`;
    });

    if (paidModels.length > 0) {
      content += `│   ${Palette.dim('PAID (never used unless you pick or approve)')}                                   │\n`;
      paidModels.slice(0, 3).forEach((m, idx) => {
        const isSelected = selectedIndex === freeModels.length + 1 + idx;
        const marker = isSelected ? Palette.cyan('▸ ○ ') : '  ○ ';
        const overrideTag = m.tier_source === 'override' ? Palette.cyan(' [override]') : '';
        const name = `${m.provider_id}/${m.model_id}`.slice(0, 35);
        content += `│ ${marker}${name.padEnd(34)} ${(m.context_length / 1024).toFixed(0)}k  tools   ${Palette.orange('$$')}${overrideTag}           │\n`;
      });
    }

    const disabledModels = models.filter((m) => m.tier === 'disabled');
    if (disabledModels.length > 0) {
      content += `│   ${Palette.dim('DISABLED (never routed by orchestrator)')}                                         │\n`;
      disabledModels.forEach((m) => {
        const name = `${m.provider_id}/${m.model_id}`.slice(0, 35);
        content += `│     ${Palette.dim('✕')} ${Palette.dim(name.padEnd(34))} ${Palette.dim('disabled')} ${Palette.cyan('[override]')}            │\n`;
      });
    }

    content += `│ ${Palette.dim('↑↓ move  ↵ select  /models tag <id> --tier <free|paid|disabled>  Esc')}               │\n`;
    content += `╰${boxRule}╯\n`;
    return content;
  }
}
