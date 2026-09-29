import { detectColorMode, formatFg } from './colors.js';
import {
  compileRow,
  mirrorGrid,
  RAW_BIRD_PIXELS,
  RAW_LOGO_PIXELS,
  RAW_SPEEDLINES_PIXELS,
} from './compiler.js';
import type { BannerRenderOptions, BannerTier, ColorMode } from './types.js';

export function getBannerTier(width: number, height?: number): BannerTier {
  if (width < 45 || (height !== undefined && height < 18)) {
    return 'minimal';
  }
  if (width < 70) {
    return 'compact';
  }
  if (width < 100) {
    return 'wordmark';
  }
  return 'full';
}

function padLeft(line: string, totalWidth: number, contentWidth: number): string {
  const pad = Math.max(0, Math.floor((totalWidth - contentWidth) / 2));
  return ' '.repeat(pad) + line;
}

export function renderBanner(options: BannerRenderOptions): string {
  const width = options.width;
  const height = options.height;
  const mode: ColorMode = options.colorMode ?? detectColorMode();
  const tier = getBannerTier(width, height);

  if (tier === 'minimal') {
    if (width < 40 || (height !== undefined && height < 12)) {
      return '[Terminal too small. Please resize terminal.]';
    }
    return '';
  }

  // Compact tier (45 <= width < 70): Single-line FLAPPY CODE
  if (tier === 'compact') {
    const { prefix: yPre, suffix: ySuf } = formatFg('Y', mode);
    const { prefix: cPre, suffix: cSuf } = formatFg('C', mode);
    const bold = mode !== 'no_color' && mode !== 'ascii' ? '\x1b[1m' : '';
    const reset = mode !== 'no_color' && mode !== 'ascii' ? '\x1b[0m' : '';

    const text = `${bold}${yPre}FLAPPY${ySuf} ${cPre}CODE${cSuf}${reset}`;
    return padLeft(text, width, 11);
  }

  // Wordmark tier (70 <= width < 100): 5-row wordmark centered
  if (tier === 'wordmark') {
    const lines = RAW_LOGO_PIXELS.map((row) => {
      const compiled = compileRow(row, mode);
      return padLeft(compiled, width, row.length);
    });
    return lines.join('\n');
  }

  // Full tier (width >= 100): Left Bird + Speedlines + Wordmark + Speedlines + Right Bird
  const birdLeft = RAW_BIRD_PIXELS;
  const birdRight = mirrorGrid(RAW_BIRD_PIXELS);
  const speedLeft = RAW_SPEEDLINES_PIXELS;
  const speedRight = mirrorGrid(RAW_SPEEDLINES_PIXELS);

  // Determine speedlines length based on available width
  // Minimum width for full tier is 100.
  // Wordmark: 63, Birds: 14 + 14 = 28, Spaces: 2. Total base = 93.
  const availableForSpeed = Math.max(0, width - 95);
  const speedCols = Math.min(10, Math.floor(availableForSpeed / 2));

  const lines: string[] = [];

  for (let r = 0; r < 5; r++) {
    const bLeft = birdLeft[r];
    const bRight = birdRight[r];
    const sLeft = speedLeft[r].slice(-Math.max(1, speedCols));
    const sRight = speedRight[r].slice(0, Math.max(1, speedCols));
    const logo = RAW_LOGO_PIXELS[r];

    const fullRow = `${bLeft}${sLeft} ${logo} ${sRight}${bRight}`;
    const compiled = compileRow(fullRow, mode);
    lines.push(padLeft(compiled, width, fullRow.length));
  }

  return lines.join('\n');
}
