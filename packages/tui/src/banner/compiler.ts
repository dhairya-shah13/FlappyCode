import { formatFg } from './colors.js';
import type { ColorMode } from './types.js';

export const RAW_LOGO_PIXELS = [
  'YYYYY.Y......YYYY..YYYY..YYYY..Y...Y...CCCC..CCCC..CCCC..CCCCC',
  'Y.....Y.....Y....Y.Y...Y.Y...Y..Y.Y...C.....C....C.C...C.C....',
  'YYYY..Y.....YYYYYY.YYYY..YYYY....Y....C.....C....C.C...C.CCCC.',
  'Y.....Y.....Y....Y.Y.....Y.......Y....C.....C....C.C...C.C....',
  'Y.....YYYYY.Y....Y.Y.....Y.......Y.....CCCC..CCCC..CCCC..CCCCC',
];

export const RAW_BIRD_PIXELS = [
  '...YYYYYY.....',
  '.YYYYYYWKYYYY.',
  'BBBBBYYYYYOOOO',
  '.BBBBBYYYYOOOO',
  '...YYYYYY.....',
];

export const RAW_SPEEDLINES_PIXELS = [
  '...S---.......',
  '.....S--------',
  'S-------------',
  '.....S--------',
  '...S---.......',
];

/**
 * Mirror a pixel grid horizontally.
 */
export function mirrorGrid(grid: string[]): string[] {
  return grid.map((row) => {
    // Reverse row characters
    const chars = Array.from(row).reverse();
    // Swap eye pupil/white orientation if needed
    for (let i = 0; i < chars.length - 1; i++) {
      if (chars[i] === 'K' && chars[i + 1] === 'W') {
        chars[i] = 'W';
        chars[i + 1] = 'K';
      }
    }
    return chars.join('');
  });
}

/**
 * Compiles a raw pixel grid row into styled terminal string.
 */
export function compileRow(row: string, mode: ColorMode): string {
  let result = '';
  let activeChar = '';
  let activeRun = '';

  const flush = () => {
    if (activeRun.length === 0) return;
    if (activeChar === '.') {
      result += ' '.repeat(activeRun.length);
    } else if (activeChar === '-') {
      const glyph = mode === 'ascii' ? '-' : '─';
      const { prefix, suffix } = formatFg('S', mode);
      result += `${prefix}${glyph.repeat(activeRun.length)}${suffix}`;
    } else {
      let glyph = '█';
      if (mode === 'ascii') {
        if (activeChar === 'Y') glyph = '#';
        else if (activeChar === 'C') glyph = '=';
        else if (activeChar === 'O') glyph = '>';
        else if (activeChar === 'B') glyph = '~';
        else if (activeChar === 'W') glyph = '*';
        else if (activeChar === 'K') glyph = 'o';
        else if (activeChar === 'S') glyph = '-';
      }
      const { prefix, suffix } = formatFg(activeChar, mode);
      result += `${prefix}${glyph.repeat(activeRun.length)}${suffix}`;
    }
    activeRun = '';
  };

  for (const ch of row) {
    if (ch === activeChar) {
      activeRun += ch;
    } else {
      flush();
      activeChar = ch;
      activeRun = ch;
    }
  }
  flush();

  return result;
}

export function compileGrid(grid: string[], mode: ColorMode): string[] {
  return grid.map((row) => compileRow(row, mode));
}
