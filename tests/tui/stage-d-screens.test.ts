import { describe, expect, it } from 'vitest';
import {
  QuestionPromptScreen,
  DiffReviewScreen,
  OnboardingWizardScreen,
  DetectedLocalProviderSummary,
} from '@flappycode/tui';
import { FileDiff } from '@flappycode/protocol';

process.env.NO_COLOR = '1';

describe('Stage D TUI Screens (GAP-048, GAP-020, GAP-040)', () => {
  const WIDTHS = [60, 80, 120];

  describe('GAP-048 — QuestionPromptScreen', () => {
    for (const width of WIDTHS) {
      it(`renders question prompt at ${width} columns with multiple choice options`, () => {
        const output = QuestionPromptScreen.render({
          questionId: 'q-101',
          agent: 'Architect',
          question: 'Should the new database migration be applied automatically or require manual confirmation?',
          options: ['Apply automatically', 'Require manual confirmation', 'Cancel task'],
          width,
        });

        expect(output).toContain('Clarifying Question');
        expect(output).toContain('Architect');
        expect(output).toContain('1. Apply automatically');
        expect(output).toContain('2. Require manual confirmation');
        expect(output).toContain('3. Cancel task');
        expect(output).toContain('Submit');
        expect(output).toContain('Skip');
      });

      it(`renders free-form question without options at ${width} columns`, () => {
        const output = QuestionPromptScreen.render({
          questionId: 'q-102',
          agent: 'Coder',
          question: 'Please enter the URL for the external webhook endpoint.',
          width,
        });

        expect(output).toContain('Clarifying Question');
        expect(output).toContain('Coder');
        expect(output).toContain('Please enter the URL');
        expect(output).toContain('Type your answer and press Enter');
      });
    }

    it('wraps long question text across multiple lines cleanly', () => {
      const longQuestion =
        'We noticed that your project has both PostgreSQL and SQLite configurations present. ' +
        'Which primary database adapter should be targeted for the new repository entity mapping layer?';
      const output = QuestionPromptScreen.render({
        questionId: 'q-103',
        agent: 'BackendPlanner',
        question: longQuestion,
        width: 60,
      });

      const lines = output.split('\n');
      expect(lines.length).toBeGreaterThan(8);
      expect(output).toContain('PostgreSQL');
      expect(output).toContain('SQLite');
    });
  });

  describe('GAP-020 / GAP-045 — DiffReviewScreen (Hunk Review)', () => {
    const diffs: FileDiff[] = [
      {
        path: 'src/auth/jwt.ts',
        oldContent: 'const secret = "default";',
        newContent: 'const secret = process.env.JWT_SECRET;',
        isNew: false,
        isDeleted: false,
        unifiedDiff: '',
        hunks: [
          {
            oldStart: 1,
            oldLines: 1,
            newStart: 1,
            newLines: 1,
            lines: [
              '-const secret = "default";',
              '+const secret = process.env.JWT_SECRET;',
            ],
          },
        ],
      },
      {
        path: 'src/utils/logger.ts',
        oldContent: 'console.log(msg);',
        newContent: 'logger.info(msg);',
        isNew: false,
        isDeleted: false,
        unifiedDiff: '',
        hunks: [
          {
            oldStart: 10,
            oldLines: 3,
            newStart: 10,
            newLines: 3,
            lines: [
              ' // Log message',
              '-console.log(msg);',
              '+logger.info(msg);',
            ],
          },
        ],
      },
    ];

    for (const width of WIDTHS) {
      it(`renders diff review at ${width} columns`, () => {
        const output = DiffReviewScreen.render(diffs, width);

        expect(output).toContain('Review changes');
        expect(output).toContain('2 files');
        expect(output).toContain('src/auth/jwt.ts');
        expect(output).toContain('src/utils/logger.ts');
        expect(output).toContain('@@ -1,1 +1,1 @@');
        expect(output).toContain('@@ -10,3 +10,3 @@');
        expect(output).toContain('-const secret = "default";');
        expect(output).toContain('+const secret = process.env.JWT_SECRET;');
        expect(output).toContain('a Apply all');
        expect(output).toContain('y Apply hunk');
      });
    }
  });

  describe('GAP-040 — OnboardingWizardScreen (Local Provider Detection)', () => {
    for (const width of WIDTHS) {
      it(`renders zero-provider state at ${width} columns`, () => {
        const output = OnboardingWizardScreen.render(width, 0);

        expect(output).toContain('Welcome to FlappyCode');
        expect(output).toContain('No providers connected yet');
        expect(output).not.toContain('Detected on this machine');
      });

      it(`renders multiple detected local providers at ${width} columns`, () => {
        const detected: DetectedLocalProviderSummary[] = [
          { id: 'ollama', displayName: 'Ollama', baseUrl: 'localhost:11434', modelsCount: 4 },
          { id: 'lmstudio', displayName: 'LM Studio', baseUrl: 'localhost:1234', modelsCount: 2 },
          { id: 'llamacpp', displayName: 'llama.cpp', baseUrl: 'localhost:8080', modelsCount: 1 },
        ];

        const output = OnboardingWizardScreen.render(width, detected);

        expect(output).toContain('Welcome to FlappyCode');
        expect(output).toContain('Detected on this machine:');
        expect(output).toContain('Ollama (localhost:11434)');
        expect(output).toContain('4 model(s)');
        expect(output).toContain('LM Studio (localhost:1234)');
        expect(output).toContain('2 model(s)');
        expect(output).toContain('llama.cpp (localhost:8080)');
        expect(output).toContain('1 model(s)');
        expect(output).toContain('Use detected Ollama');
        expect(output).toContain('Use detected LM Studio');
        expect(output).toContain('Use detected llama.cpp');
      });
    }
  });
});
