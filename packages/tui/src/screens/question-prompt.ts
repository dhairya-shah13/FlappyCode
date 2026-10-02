import { Palette } from '../palette.js';

export interface QuestionPromptProps {
  questionId: string;
  agent: string;
  question: string;
  options?: string[];
  width?: number;
}

/**
 * Clarifying question prompt screen (P1-G10 / GAP-048).
 * Renders the question text, requesting agent, numbered multiple-choice
 * options, and supports custom text input for free-form answers.
 */
export class QuestionPromptScreen {
  public static render(props: QuestionPromptProps): string {
    const width = props.width ?? 80;
    const boxRule = '─'.repeat(Math.max(20, width - 4));
    const innerWidth = Math.max(16, width - 6);

    const lines: string[] = [];
    lines.push(`╭─ ${Palette.bold('Clarifying Question')} ── from ${Palette.cyan(props.agent)} ${boxRule.slice(Math.min(40, width - 40))}╮`);
    lines.push(`│${' '.padEnd(innerWidth + 1)}│`);

    // Word-wrap question text
    const words = props.question.split(' ');
    let line = '';
    for (const word of words) {
      if (line.length + word.length + 1 > innerWidth - 2) {
        lines.push(`│  ${line.padEnd(innerWidth - 1)}│`);
        line = word;
      } else {
        line = line ? `${line} ${word}` : word;
      }
    }
    if (line) {
      lines.push(`│  ${line.padEnd(innerWidth - 1)}│`);
    }

    lines.push(`│${' '.padEnd(innerWidth + 1)}│`);

    // Numbered options
    if (props.options && props.options.length > 0) {
      for (let i = 0; i < props.options.length; i++) {
        const optText = props.options[i].slice(0, innerWidth - 8);
        lines.push(`│  ${Palette.cyan(`${i + 1}.`)} ${optText.padEnd(innerWidth - 5)}│`);
      }
      lines.push(`│${' '.padEnd(innerWidth + 1)}│`);
      lines.push(`│  ${Palette.dim('Type a number to select, or type a custom answer and press Enter')}`);
    } else {
      lines.push(`│  ${Palette.dim('Type your answer and press Enter')}`);
    }

    lines.push(`│${' '.padEnd(innerWidth + 1)}│`);
    lines.push(`│  ${Palette.ok('[ ↵ Submit ]')}   ${Palette.dim('[ Esc Skip ]')}${''.padEnd(Math.max(0, innerWidth - 30))}│`);
    lines.push(`╰${boxRule}╯`);

    return lines.join('\n');
  }
}
