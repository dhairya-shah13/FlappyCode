import { Palette } from './palette.js';

export class BannerRenderer {
  public static renderBanner(width: number): string {
    if (width < 45) {
      return '';
    }

    if (width < 70) {
      // 45-69 cols: single-line FLAPPYCODE text per CLIDesign.md §4.1
      const flappy = Palette.yellow(Palette.bold('FLAPPY'));
      const code = Palette.cyan(Palette.bold('CODE'));
      return `\n ${flappy}${code}\n`;
    }

    const flappyWordmark = [
      '█████ █      ████  ████  ████  █   █',
      '█     █     █    █ █   █ █   █  █ █ ',
      '████  █     ██████ ████  ████    █  ',
      '█     █     █    █ █     █       █  ',
      '█     █████ █    █ █     █       █  ',
    ];

    const codeWordmark = [
      ' ████  ████  ████  █████',
      '█     █    █ █   █ █    ',
      '█     █    █ █   █ ████ ',
      '█     █    █ █   █ █    ',
      ' ████  ████  ████  █████',
    ];

    if (width < 100) {
      // 70-99 cols: Wordmark only per CLIDesign.md §4.1
      const lines: string[] = [''];
      for (let i = 0; i < flappyWordmark.length; i++) {
        const left = Palette.yellow(flappyWordmark[i]);
        const right = Palette.cyan(codeWordmark[i]);
        const combined = `  ${left}   ${right}`;
        lines.push(combined);
      }
      lines.push('');
      return lines.join('\n');
    }

    // >= 100 cols: Full banner with birds and speed lines
    const leftBird = [
      '    ▄██████████████▄    ',
      '  ▄████░░░░░░░░█▀──█▄   ',
      ' ──██░░░░░░░░░░█▀───█▄  ',
      '──██░░░░░░░░░░░█────██  ',
      '─████████████░░██───██  ',
    ];

    const rightBird = [
      '    ▄██████████████▄    ',
      '   ▄█──▀█░░░░░░░░████▄  ',
      '  ▄█───▀█░░░░░░░░░░██── ',
      '  ██────█░░░░░░░░░░░██──',
      '  ██───██░░████████████─',
    ];

    const lines: string[] = [''];
    for (let i = 0; i < flappyWordmark.length; i++) {
      const birdL = Palette.subtle(leftBird[i]);
      const wordL = Palette.yellow(flappyWordmark[i]);
      const wordR = Palette.cyan(codeWordmark[i]);
      const birdR = Palette.subtle(rightBird[i]);
      lines.push(` ${birdL}  ${wordL}   ${wordR}  ${birdR}`);
    }
    lines.push('');
    return lines.join('\n');
  }

  public static renderTaglines(width: number): string {
    if (width < 45) return '';
    const line1 = 'Multi-Provider  •  Multi-Agent  •  Free Models  •  One Assistant';
    const line2 = 'Your connected providers. All the free models. One powerful coding agent.';

    if (width < 70) {
      return ` ${Palette.subtle(line2)}\n`;
    }

    return ` ${Palette.bold(line1)}\n ${Palette.subtle(line2)}\n`;
  }
}
