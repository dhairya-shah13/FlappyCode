import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { BannerRenderer, StatusBarRenderer, Palette, PermissionPromptScreen, PlanApprovalScreen } from '@flappycode/tui';

describe('GAP-031: TUI Multi-Resolution & Terminal Compatibility Tests', () => {
  const origEnv = { ...process.env };

  beforeEach(() => {
    delete process.env.NO_COLOR;
    delete process.env.FLAPPYCODE_PLAIN;
    delete process.env.FLAPPYCODE_ASCII;
    delete process.env.FORCE_COLOR;
    delete process.env.TERM;
    delete process.env.FLAPPYCODE_NO_ANIM;
  });

  afterEach(() => {
    process.env = { ...origEnv };
  });

  describe('Multi-Resolution Status Bar Rendering', () => {
    const widths = [16, 20, 30, 40, 45, 60, 80, 120, 200];

    for (const width of widths) {
      it(`renders status bar cleanly at width ${width} without crash`, () => {
        const output = StatusBarRenderer.render({
          version: '0.1.0',
          connectedProviders: 3,
          freeModelsAvailable: 12,
          state: 'ready',
          width,
        });

        expect(output).toBeDefined();
        expect(output.length).toBeGreaterThan(0);
        if (width >= 45) {
          expect(output).toContain('0.1.0');
        }
        expect(output).toContain('12');
      });
    }
  });

  describe('Banner Rendering at Variable Widths', () => {
    it('collapses banner to empty string on narrow terminals (< 45 cols)', () => {
      expect(BannerRenderer.renderBanner(20)).toBe('');
      expect(BannerRenderer.renderBanner(40)).toBe('');
      expect(BannerRenderer.renderTaglines(40)).toBe('');
    });

    it('renders single-line FLAPPYCODE text on 45-69 cols', () => {
      const banner = BannerRenderer.renderBanner(50);
      expect(banner).toContain('FLAPPY');
      expect(banner).toContain('CODE');
      const taglines = BannerRenderer.renderTaglines(50);
      expect(taglines.length).toBeGreaterThan(0);
      expect(taglines).toContain('Free Models');
    });

    it('renders wordmark on 70-99 cols', () => {
      const banner = BannerRenderer.renderBanner(80);
      expect(banner).toContain('█████');
      const taglines = BannerRenderer.renderTaglines(80);
      expect(taglines).toContain('Multi-Provider');
    });

    it('renders full banner with ascii birds on >= 100 cols', () => {
      const banner = BannerRenderer.renderBanner(120);
      expect(banner).toContain('█████');
      expect(banner).toContain('▄██████████████▄');
    });
  });

  describe('NO_COLOR, TERM=dumb, and FORCE_COLOR Handling', () => {
    it('strips ANSI color escapes when NO_COLOR=1', () => {
      process.env.NO_COLOR = '1';
      const text = Palette.cyan('Hello Flappy');
      expect(text).toBe('Hello Flappy');
      expect(text).not.toContain('\x1b[');
    });

    it('strips ANSI color escapes when TERM=dumb', () => {
      process.env.TERM = 'dumb';
      const text = Palette.yellow('Plain Text');
      expect(text).toBe('Plain Text');
      expect(text).not.toContain('\x1b[');
    });

    it('enables ANSI color when FORCE_COLOR=1 even if TERM=dumb', () => {
      process.env.TERM = 'dumb';
      process.env.FORCE_COLOR = '1';
      const text = Palette.yellow('Colored Text');
      expect(text).toContain('\x1b[');
    });

    it('NO_COLOR takes precedence over FORCE_COLOR', () => {
      process.env.NO_COLOR = '1';
      process.env.FORCE_COLOR = '1';
      const text = Palette.yellow('No Color Text');
      expect(text).toBe('No Color Text');
      expect(text).not.toContain('\x1b[');
    });
  });

  describe('ASCII Mode (FLAPPYCODE_ASCII=1)', () => {
    it('uses ASCII bird <o) and ASCII separator | in status bar', () => {
      process.env.FLAPPYCODE_ASCII = '1';
      process.env.NO_COLOR = '1';
      const output = StatusBarRenderer.render({
        version: '0.1.0',
        connectedProviders: 2,
        freeModelsAvailable: 5,
        state: 'ready',
        width: 80,
      });

      expect(output).toContain('<o)');
      expect(output).not.toContain('🐦');
      expect(output).toContain('|');
      expect(output).toContain('Ready!');
    });
  });

  describe('Screen Compatibility on Narrow Terminals', () => {
    it('renders PermissionPromptScreen without error at width 40', () => {
      const output = PermissionPromptScreen.render({
        agent: 'orchestrator',
        command: 'pnpm test',
        isDestructive: false,
        reason: 'Run unit test suite',
        width: 40,
      });
      expect(output).toContain('Permission Needed');
      expect(output).toContain('pnpm test');
    });

    it('renders PlanApprovalScreen without error at width 40', () => {
      const output = PlanApprovalScreen.render({
        id: 'plan-1',
        planner_model: 'gemini-2.0-flash',
        goal: 'Refactor database migration',
        files_to_modify: ['db.ts'],
        assumptions: ['Schema exists'],
        graph: {
          nodes: [
            { id: '1', agent: 'coder', description: 'Apply migration' },
          ],
          edges: [],
        },
      } as any, 40);
      expect(output).toContain('Implementation Plan');
      expect(output).toContain('Apply migration');
    });
  });
});
