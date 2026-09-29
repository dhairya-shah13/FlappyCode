export type ColorMode = 'truecolor' | 'ansi256' | 'ansi16' | 'no_color' | 'ascii';

export type BannerTier = 'full' | 'wordmark' | 'compact' | 'minimal';

export interface RgbColor {
  r: number;
  g: number;
  b: number;
}

export interface BannerRenderOptions {
  width: number;
  height?: number;
  colorMode?: ColorMode;
}
