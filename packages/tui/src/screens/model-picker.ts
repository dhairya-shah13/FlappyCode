import { Model } from '@flappycode/protocol';
import { Palette } from '../palette.js';

export interface ModelPickerItem {
  id: string; // 'flappyauto' or `${provider_id}/${model_id}`
  provider_id: string;
  model_id: string;
  model?: Model;
  tier: Model['tier'];
  displayName: string;
}

export class ModelPickerScreen {
  public cursorIndex: number = 0;
  public activeModelId: string = 'flappyauto';
  public statusMessage?: { text: string; type: 'error' | 'warn' | 'info' };
  private items: ModelPickerItem[] = [];

  constructor(models: Model[], activeModelId: string = 'flappyauto') {
    this.activeModelId = activeModelId;

    // Row 0 is always flappyauto (default)
    this.items = [
      {
        id: 'flappyauto',
        provider_id: 'flappyauto',
        model_id: 'flappyauto',
        tier: 'free',
        displayName: 'flappyauto (auto-select free model)',
      },
    ];

    // Add free, paid, disabled models
    for (const m of models) {
      this.items.push({
        id: `${m.provider_id}/${m.model_id}`,
        provider_id: m.provider_id,
        model_id: m.model_id,
        model: m,
        tier: m.tier,
        displayName: `${m.provider_id}/${m.model_id}`,
      });
    }

    // Set cursor to active model if present
    const activeIdx = this.items.findIndex(
      (it) => it.id === activeModelId || it.model_id === activeModelId
    );
    if (activeIdx >= 0) {
      this.cursorIndex = activeIdx;
    }
  }

  public getItems(): ModelPickerItem[] {
    return this.items;
  }

  public moveUp(): void {
    if (this.items.length <= 1) return;
    if (this.cursorIndex > 0) {
      this.cursorIndex--;
    } else {
      this.cursorIndex = this.items.length - 1; // wrapping
    }
  }

  public moveDown(): void {
    if (this.items.length <= 1) return;
    if (this.cursorIndex < this.items.length - 1) {
      this.cursorIndex++;
    } else {
      this.cursorIndex = 0; // wrapping
    }
  }

  public getSelected(): ModelPickerItem {
    return this.items[this.cursorIndex] || this.items[0];
  }

  public setStatus(text: string, type: 'error' | 'warn' | 'info' = 'info'): void {
    this.statusMessage = { text, type };
  }

  public clearStatus(): void {
    this.statusMessage = undefined;
  }

  public render(width = 80): string {
    const boxRule = '─'.repeat(Math.max(20, width - 4));
    let content = `╭─ ${Palette.bold('Choose model')} ${boxRule.slice(14)}╮\n`;

    // Row 0: flappyauto
    const autoItem = this.items[0];
    const isAutoCursor = this.cursorIndex === 0;
    const isAutoActive = this.activeModelId === 'flappyauto';
    const autoCursor = isAutoCursor ? Palette.cyan('▸ ') : '  ';
    const autoActiveTag = isAutoActive ? Palette.ok(' [ACTIVE]') : Palette.dim(' [DEFAULT]');
    const autoLabel = isAutoCursor ? Palette.cyan('⚡ flappyauto') : '⚡ flappyauto';
    content += `│ ${autoCursor}${autoLabel.padEnd(20)} Multi-agent orchestration · best free model${autoActiveTag.padEnd(16)} │\n`;
    content += `│ ${'─'.repeat(Math.max(20, width - 6))} │\n`;

    // Group remaining items
    const freeItems = this.items.slice(1).filter((it) => it.tier === 'free' || it.tier === 'rate_limited_free');
    const paidItems = this.items.slice(1).filter((it) => it.tier === 'paid');
    const disabledItems = this.items.slice(1).filter((it) => it.tier === 'disabled');

    if (freeItems.length > 0) {
      content += `│   ${Palette.bold('FREE MODELS')}                                                                 │\n`;
      for (const it of freeItems) {
        const itemIdx = this.items.indexOf(it);
        const isCursor = this.cursorIndex === itemIdx;
        const isActive = this.activeModelId === it.id || this.activeModelId === it.model_id;
        const cursor = isCursor ? Palette.cyan('▸ ') : '  ';
        const activeTag = isActive ? Palette.ok(' [ACTIVE]') : '';
        const m = it.model;
        const tag = m?.is_local ? Palette.ok('local') : Palette.subtle('free');
        const overrideTag = m?.tier_source === 'override' ? Palette.cyan(' [override]') : '';
        const ctxStr = m ? `${(m.context_length / 1024).toFixed(0)}k` : '';
        const name = it.id.slice(0, 32);
        const lineContent = `${cursor}● ${name.padEnd(32)} ${ctxStr.padEnd(5)} ${tag}${overrideTag}${activeTag}`;
        content += `│ ${lineContent.padEnd(width - 5)} │\n`;
      }
    }

    if (paidItems.length > 0) {
      content += `│   ${Palette.dim('PAID MODELS (requires explicit user confirmation)')}                         │\n`;
      for (const it of paidItems) {
        const itemIdx = this.items.indexOf(it);
        const isCursor = this.cursorIndex === itemIdx;
        const isActive = this.activeModelId === it.id || this.activeModelId === it.model_id;
        const cursor = isCursor ? Palette.cyan('▸ ') : '  ';
        const activeTag = isActive ? Palette.ok(' [ACTIVE]') : '';
        const m = it.model;
        const overrideTag = m?.tier_source === 'override' ? Palette.cyan(' [override]') : '';
        const ctxStr = m ? `${(m.context_length / 1024).toFixed(0)}k` : '';
        const name = it.id.slice(0, 32);
        const lineContent = `${cursor}○ ${name.padEnd(32)} ${ctxStr.padEnd(5)} ${Palette.orange('$$')}${overrideTag}${activeTag}`;
        content += `│ ${lineContent.padEnd(width - 5)} │\n`;
      }
    }

    if (disabledItems.length > 0) {
      content += `│   ${Palette.dim('DISABLED MODELS (cannot be selected)')}                                        │\n`;
      for (const it of disabledItems) {
        const itemIdx = this.items.indexOf(it);
        const isCursor = this.cursorIndex === itemIdx;
        const cursor = isCursor ? Palette.cyan('▸ ') : '  ';
        const name = it.id.slice(0, 32);
        const lineContent = `${cursor}${Palette.dim(`✕ ${name.padEnd(32)} disabled [override]`)}`;
        content += `│ ${lineContent.padEnd(width - 5)} │\n`;
      }
    }

    if (this.statusMessage) {
      content += `│ ${'─'.repeat(Math.max(20, width - 6))} │\n`;
      const msg = this.statusMessage.text.slice(0, width - 6);
      const coloredMsg =
        this.statusMessage.type === 'error'
          ? Palette.error(msg)
          : this.statusMessage.type === 'warn'
          ? Palette.yellow(msg)
          : Palette.cyan(msg);
      content += `│ ${coloredMsg.padEnd(width - 5)} │\n`;
    }

    content += `│ ${Palette.dim('↑↓/k/j move  ↵ select  Esc/q cancel  /models tag <id> --tier <tier>')} │\n`;
    content += `╰${boxRule}╯\n`;
    return content;
  }

  public static render(models: Model[], selectedIndex = 0, width = 80): string {
    const screen = new ModelPickerScreen(models);
    screen.cursorIndex = Math.max(0, Math.min(selectedIndex, screen.getItems().length - 1));
    return screen.render(width);
  }
}
