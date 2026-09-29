import { describe, expect, it } from 'vitest';
import {
  compileRow,
  getBannerTier,
  mirrorGrid,
  renderBanner,
} from '../banner/index.js';

describe('Banner Tiers', () => {
  it('identifies full tier for width >= 100', () => {
    expect(getBannerTier(100, 25)).toBe('full');
    expect(getBannerTier(120, 30)).toBe('full');
  });

  it('identifies wordmark tier for 70 <= width < 100', () => {
    expect(getBannerTier(70, 25)).toBe('wordmark');
    expect(getBannerTier(99, 25)).toBe('wordmark');
  });

  it('identifies compact tier for 45 <= width < 70', () => {
    expect(getBannerTier(45, 25)).toBe('compact');
    expect(getBannerTier(69, 25)).toBe('compact');
  });

  it('identifies minimal tier for width < 45 or height < 18', () => {
    expect(getBannerTier(44, 25)).toBe('minimal');
    expect(getBannerTier(100, 15)).toBe('minimal');
  });
});

describe('Banner Renderer', () => {
  it('renders full tier with birds, speedlines, and wordmark', () => {
    const banner = renderBanner({ width: 120, height: 30, colorMode: 'no_color' });
    const lines = banner.split('\n');
    expect(lines).toHaveLength(5);
    // Contains blocks and speedlines
    expect(banner).toContain('█');
    expect(banner).toContain('─');
  });

  it('renders wordmark tier centered', () => {
    const banner = renderBanner({ width: 80, height: 25, colorMode: 'no_color' });
    const lines = banner.split('\n');
    expect(lines).toHaveLength(5);
    expect(banner).toContain('█');
    // Does NOT contain bird speedlines
    expect(banner).not.toContain('─');
  });

  it('renders compact single line tier', () => {
    const banner = renderBanner({ width: 60, height: 25, colorMode: 'no_color' });
    const lines = banner.split('\n');
    expect(lines).toHaveLength(1);
    expect(banner).toContain('FLAPPY CODE');
  });

  it('renders minimal tier for small terminals', () => {
    const banner = renderBanner({ width: 44, height: 20, colorMode: 'no_color' });
    expect(banner).toBe('');

    const tooSmall = renderBanner({ width: 35, height: 10, colorMode: 'no_color' });
    expect(tooSmall).toContain('Terminal too small');
  });
});

describe('Color Modes & ASCII Degradation', () => {
  it('generates clean output without ANSI escapes in no_color mode', () => {
    const banner = renderBanner({ width: 120, height: 30, colorMode: 'no_color' });
    expect(banner).not.toContain('\x1b[');
  });

  it('generates ASCII fallback using standard characters', () => {
    const banner = renderBanner({ width: 120, height: 30, colorMode: 'ascii' });
    expect(banner).not.toContain('\x1b[');
    expect(banner).toContain('#'); // yellow mapped to #
    expect(banner).toContain('='); // cyan mapped to =
  });

  it('includes 24-bit TrueColor escapes in truecolor mode', () => {
    const banner = renderBanner({ width: 120, height: 30, colorMode: 'truecolor' });
    expect(banner).toContain('\x1b[38;2;');
    expect(banner).toContain('255;199;44'); // flappy yellow
    expect(banner).toContain('0;183;255');   // code cyan
  });
});

describe('Compiler & Grid Mirroring', () => {
  it('mirrors sprite grid horizontally', () => {
    const original = ['ABCD', 'EFGH'];
    const mirrored = mirrorGrid(original);
    expect(mirrored).toEqual(['DCBA', 'HGFE']);
  });

  it('compiles row with run-length compression', () => {
    const compiled = compileRow('YYYY....CCCC', 'no_color');
    expect(compiled).toBe('████    ████');
  });
});
