import type { ColorMode, RgbColor } from './types.js';

export const PALETTE: Record<string, RgbColor> = {
  Y: { r: 255, g: 199, b: 44 },  // flappy-yellow #FFC72C
  C: { r: 0, g: 183, b: 255 },   // code-cyan #00B7FF
  O: { r: 255, g: 122, b: 47 },  // beak-orange #FF7A2F
  B: { r: 0, g: 136, b: 204 },   // wing-blue #0088CC
  W: { r: 255, g: 255, b: 255 }, // eye-white #FFFFFF
  K: { r: 2, g: 11, b: 20 },     // pupil/dark #020B14
  S: { r: 0, g: 183, b: 255 },   // speedlines cyan
};

export function detectColorMode(): ColorMode {
  if (process.env.NO_COLOR || process.env.FLAPPYCODE_NO_COLOR) {
    return 'no_color';
  }
  if (process.env.TERM === 'dumb') {
    return 'ascii';
  }
  if (
    process.env.COLORTERM === 'truecolor' ||
    process.env.COLORTERM === '24bit' ||
    process.env.TERM_PROGRAM === 'vscode' ||
    process.env.WT_SESSION // Windows Terminal
  ) {
    return 'truecolor';
  }
  return 'ansi256';
}

export function formatFg(char: string, mode: ColorMode): { prefix: string; suffix: string } {
  if (mode === 'no_color' || mode === 'ascii') {
    return { prefix: '', suffix: '' };
  }

  const rgb = PALETTE[char];
  if (!rgb) {
    return { prefix: '', suffix: '' };
  }

  if (mode === 'truecolor') {
    return {
      prefix: `\x1b[38;2;${rgb.r};${rgb.g};${rgb.b}m`,
      suffix: '\x1b[39m',
    };
  }

  // 16-color ANSI fallback
  if (mode === 'ansi16') {
    if (char === 'Y') return { prefix: '\x1b[33m', suffix: '\x1b[39m' };
    if (char === 'C' || char === 'S') return { prefix: '\x1b[36m', suffix: '\x1b[39m' };
    if (char === 'O') return { prefix: '\x1b[31m', suffix: '\x1b[39m' };
    if (char === 'B') return { prefix: '\x1b[34m', suffix: '\x1b[39m' };
    if (char === 'W') return { prefix: '\x1b[37m', suffix: '\x1b[39m' };
    return { prefix: '', suffix: '' };
  }

  // 256-color fallback
  if (char === 'Y') return { prefix: '\x1b[38;5;220m', suffix: '\x1b[39m' };
  if (char === 'C' || char === 'S') return { prefix: '\x1b[38;5;39m', suffix: '\x1b[39m' };
  if (char === 'O') return { prefix: '\x1b[38;5;208m', suffix: '\x1b[39m' };
  if (char === 'B') return { prefix: '\x1b[38;5;32m', suffix: '\x1b[39m' };
  if (char === 'W') return { prefix: '\x1b[38;5;231m', suffix: '\x1b[39m' };
  if (char === 'K') return { prefix: '\x1b[38;5;232m', suffix: '\x1b[39m' };

  return { prefix: '', suffix: '' };
}
