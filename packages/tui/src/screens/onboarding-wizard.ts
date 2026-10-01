import { Palette } from '../palette.js';

export class OnboardingWizardScreen {
  public static render(width = 80, detectedOllamaModels = 0): string {
    const boxRule = '─'.repeat(Math.max(20, width - 4));
    let content = `╭─ ${Palette.bold('Welcome to FlappyCode')} ${boxRule.slice(22)}╮\n`;
    content += `│ No providers connected yet. Connect one and I'll find its free models.      │\n`;
    content += `│                                                                              │\n`;

    if (detectedOllamaModels > 0) {
      content += `│  Detected on this machine:   ● ${Palette.ok('Ollama (localhost:11434)')}  — ${detectedOllamaModels} models          │\n`;
      content += `│                                                                              │\n`;
    }

    content += `│  ${Palette.cyan('▸ Connect a provider…')}        ↵                                              │\n`;
    if (detectedOllamaModels > 0) {
      content += `│    Use detected Ollama        ↵                                              │\n`;
    }
    content += `│    Skip for now               Esc                                            │\n`;
    content += `╰${boxRule}╯\n`;
    return content;
  }
}
