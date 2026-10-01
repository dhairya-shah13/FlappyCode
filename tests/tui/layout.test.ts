import { describe, expect, it } from 'vitest';
import {
  BannerRenderer,
  DiffReviewScreen,
  HomeScreen,
  ModelPickerScreen,
  PlanApprovalScreen,
} from '@flappycode/tui';
import { FileDiff, PlanProposal } from '@flappycode/protocol';

describe('TUI Responsive Layout & Screens (FR-CLI-001, FR-CLI-002)', () => {
  it('Renders banner responsively according to terminal width', () => {
    // Narrow terminal (< 45 cols): empty banner to avoid line breaks
    const narrow = BannerRenderer.renderBanner(40);
    expect(narrow).toBe('');

    // Compact terminal (45-69 cols): single-line text banner
    const compact = BannerRenderer.renderBanner(60);
    expect(compact).toContain('FLAPPY');
    expect(compact).toContain('CODE');

    // Medium terminal (70-99 cols): pixel block wordmark
    const medium = BannerRenderer.renderBanner(80);
    expect(medium).toContain('█');

    // Wide terminal (>= 100 cols): full banner with birds and speed lines
    const wide = BannerRenderer.renderBanner(120);
    expect(wide).toContain('█');
    expect(wide.length).toBeGreaterThan(medium.length);
  });

  it('Renders HomeScreen without crashing', () => {
    const output = HomeScreen.render({
      status: {
        version: '0.1.0',
        connectedProviders: 2,
        freeModelsAvailable: 5,
        state: 'ready',
        width: 80,
      },
      width: 80,
    });

    expect(output).toContain('Providers:');
    expect(output).toContain('connected');
    expect(output).toContain('Free models:');
    expect(output).toContain('available');
    expect(output).toContain('FlappyCode');
    expect(output).toContain('╭');
    expect(output).toContain('╮');
    expect(output).toContain('╰');
    expect(output).toContain('╯');
  });

  it('Renders HomeScreen.renderLayout with accurate cursor positioning inside the box', () => {
    const layoutEmpty = HomeScreen.renderLayout({
      status: {
        version: '0.1.0',
        connectedProviders: 1,
        freeModelsAvailable: 4,
        state: 'ready',
        width: 90,
      },
      width: 90,
    });

    expect(layoutEmpty.cursorRow).toBeGreaterThan(1);
    expect(layoutEmpty.cursorCol).toBe(7); // Column 7 is right after '│ >_  '
    expect(layoutEmpty.output).toContain('Type your coding request here...');

    // When typing text into the box
    const layoutWithText = HomeScreen.renderLayout({
      status: {
        version: '0.1.0',
        connectedProviders: 1,
        freeModelsAvailable: 4,
        state: 'ready',
        width: 90,
      },
      width: 90,
      inputPrompt: 'Write a quicksort function',
      cursorPos: 26,
    });

    expect(layoutWithText.output).toContain('Write a quicksort function');
    expect(layoutWithText.cursorCol).toBe(7 + 26);
  });

  it('Renders ModelPickerScreen with model list and tiers', () => {
    const output = ModelPickerScreen.render([
      {
        provider_id: 'p1',
        model_id: 'model-free-1',
        tier: 'free',
        tier_source: 'metadata',
        context_length: 32768,
        modality: 'text->text',
        supports_tools: true,
        supports_vision: false,
        tool_probe_passed: true,
        price_in: 0,
        price_out: 0,
        avg_latency_ms: 120,
        last_validated_at: Date.now(),
        data_use_policy: 'no_training',
        is_local: false,
        is_pinned: false,
      },
      {
        provider_id: 'p2',
        model_id: 'model-paid-1',
        tier: 'paid',
        tier_source: 'metadata',
        context_length: 128000,
        modality: 'text->text',
        supports_tools: true,
        supports_vision: true,
        tool_probe_passed: true,
        price_in: 5,
        price_out: 15,
        avg_latency_ms: 500,
        last_validated_at: Date.now(),
        data_use_policy: 'no_training',
        is_local: false,
        is_pinned: false,
      },
    ]);

    expect(output).toContain('Choose model');
    expect(output).toContain('flappyauto');
    expect(output).toContain('model-free-1');
    expect(output).toContain('FREE');
    expect(output).toContain('PAID');
  });

  it('Renders PlanApprovalScreen with files and architecture summary', () => {
    const plan: PlanProposal = {
      run_id: 'run-1',
      goal: 'Refactor database connection pool',
      planner_model: 'mock-planner',
      assumptions: ['SQLite in WAL mode'],
      risks: ['None'],
      files_to_modify: ['packages/storage/src/db.ts', 'packages/storage/src/pool.ts'],
      graph: {
        id: 'graph-1',
        goal: 'Refactor database connection pool',
        created_at: Date.now(),
        nodes: [
          {
            id: 'node-1',
            agent: 'Coder',
            description: 'Implement pool connection',
            depends_on: [],
            status: 'pending',
            substitutions: [],
            tool_calls: [],
            iterations: 0,
          },
        ],
      },
      timestamp: Date.now(),
    };

    const output = PlanApprovalScreen.render(plan);
    expect(output).toContain('Implementation Plan');
    expect(output).toContain('Refactor database connection pool');
    expect(output).toContain('packages/storage/src/db.ts');
    expect(output).toContain('Approve plan');
    expect(output).toContain('Reject');
  });

  it('Renders DiffReviewScreen with diff hunks and navigation hotkeys', () => {
    const diff: FileDiff = {
      path: 'index.ts',
      oldContent: 'const a = 1;\n',
      newContent: 'const a = 2;\n',
      isNew: false,
      isDeleted: false,
      hunks: [
        {
          oldStart: 1,
          oldLines: 1,
          newStart: 1,
          newLines: 1,
          lines: ['-const a = 1;', '+const a = 2;'],
        },
      ],
      unifiedDiff: '--- a/index.ts\n+++ b/index.ts\n@@ -1 +1 @@\n-const a = 1;\n+const a = 2;\n',
    };

    const output = DiffReviewScreen.render([diff], 80);
    expect(output).toContain('Review changes');
    expect(output).toContain('index.ts');
    expect(output).toContain('Apply all');
  });
});
