import { Palette } from '../palette.js';

export interface DetectedLocalProviderSummary {
  id: string;
  displayName: string;
  baseUrl: string;
  modelsCount: number;
}

export class OnboardingWizardScreen {
  public static render(
    width = 80,
    detectedProviders: number | DetectedLocalProviderSummary[] = 0
  ): string {
    const list: DetectedLocalProviderSummary[] =
      typeof detectedProviders === 'number'
        ? detectedProviders > 0
          ? [{ id: 'ollama', displayName: 'Ollama', baseUrl: 'localhost:11434', modelsCount: detectedProviders }]
          : []
        : detectedProviders;

    const boxRule = '─'.repeat(Math.max(20, width - 4));
    let content = `╭─ ${Palette.bold('Welcome to FlappyCode')} ${boxRule.slice(22)}╮\n`;
    content += `│ No providers connected yet. Connect one and I'll find its free models.      │\n`;
    content += `│                                                                              │\n`;

    if (list.length > 0) {
      content += `│  Detected on this machine:                                                   │\n`;
      for (const p of list) {
        const line = `   ● ${Palette.ok(`${p.displayName} (${p.baseUrl})`)}  — ${p.modelsCount} model(s)`;
        content += `│ ${line.padEnd(Math.max(40, width - 6))} │\n`;
      }
      content += `│                                                                              │\n`;
    }

    content += `│  ${Palette.cyan('▸ Connect a provider…')}        ↵                                              │\n`;
    if (list.length > 0) {
      for (const p of list) {
        content += `│    Use detected ${p.displayName.padEnd(14)} ↵                                              │\n`;
      }
    }
    content += `│    Skip for now               Esc                                            │\n`;
    content += `╰${boxRule}╯\n`;
    return content;
  }
}
