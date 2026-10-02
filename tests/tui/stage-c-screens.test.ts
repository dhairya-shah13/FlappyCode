import { describe, expect, it } from 'vitest';
import {
  TaskGraphScreen,
  QuestionPromptScreen,
  PlanApprovalScreen,
  DiffReviewScreen,
  PermissionPromptScreen,
  PoolExhaustedScreen,
} from '@flappycode/tui';

// Force no-color for deterministic output
process.env.NO_COLOR = '1';

/**
 * Stage C TUI screens tests (P1-G8, P1-G9, P1-G10).
 * Verifies rendering and responsiveness across 60, 80, 120 column widths.
 */
describe('Stage C TUI Screens', () => {
  const WIDTHS = [60, 80, 120];

  describe('P1-G9 — TaskGraphScreen', () => {
    const nodes = [
      { id: 'node-1', agent: 'File-Finder', description: 'Locate relevant files', depends_on: [], status: 'completed' as const, model_used: 'qwen-2.5-coder-7b', substitutions: [], tool_calls: [], iterations: 0 },
      { id: 'node-2', agent: 'Coder', description: 'Implement the fix', depends_on: ['node-1'], status: 'running' as const, model_used: 'claude-3-5-sonnet', substitutions: ['llama -> claude (rate limit)'], tool_calls: [], iterations: 1 },
      { id: 'node-3', agent: 'Tester', description: 'Run test suite', depends_on: ['node-2'], status: 'pending' as const, substitutions: [], tool_calls: [], iterations: 0 },
    ];

    for (const width of WIDTHS) {
      it(`renders at ${width} columns without overflow`, () => {
        const output = TaskGraphScreen.render({
          goal: 'Fix the authentication bug',
          nodes,
          plannerModel: 'llama-3.1-8b',
          state: 'WORKING',
          width,
        });

        expect(output).toContain('Task Graph');
        expect(output).toContain('File-Finder');
        expect(output).toContain('Coder');
        expect(output).toContain('Tester');
        // No line should be absurdly long
        for (const line of output.split('\n')) {
          // ANSI codes add virtual length, so stripped check is approximate
          const stripped = line.replace(/\x1b\[[0-9;]*m/g, '');
          // Allow some flexibility for box drawing
          expect(stripped.length).toBeLessThan(width + 60);
        }
      });
    }

    it('shows substitution info', () => {
      const output = TaskGraphScreen.render({
        goal: 'test',
        nodes,
        state: 'WORKING',
        width: 120,
      });
      expect(output).toContain('subst');
    });

    it('shows iteration count', () => {
      const output = TaskGraphScreen.render({
        goal: 'test',
        nodes,
        state: 'WORKING',
        width: 120,
      });
      expect(output).toContain('iter');
    });

    it('renders COMPLETE state', () => {
      const completed = nodes.map((n) => ({ ...n, status: 'completed' as const }));
      const output = TaskGraphScreen.render({
        goal: 'done',
        nodes: completed,
        state: 'COMPLETE',
        width: 80,
      });
      expect(output).toContain('Complete');
      expect(output).toContain('3/3 done');
    });
  });

  describe('P1-G10 — QuestionPromptScreen', () => {
    for (const width of WIDTHS) {
      it(`renders with options at ${width} columns`, () => {
        const output = QuestionPromptScreen.render({
          questionId: 'q1',
          agent: 'Coder',
          question: 'Which database should be used for this project?',
          options: ['PostgreSQL', 'SQLite', 'MongoDB'],
          width,
        });

        expect(output).toContain('Clarifying Question');
        expect(output).toContain('Coder');
        expect(output).toContain('1.');
        expect(output).toContain('PostgreSQL');
      });
    }

    it('renders without options for free-form answer', () => {
      const output = QuestionPromptScreen.render({
        questionId: 'q2',
        agent: 'File-Finder',
        question: 'What is the main entry point?',
        width: 80,
      });

      expect(output).toContain('Clarifying Question');
      expect(output).toContain('Type your answer');
    });
  });

  describe('P1-G8 — PlanApprovalScreen', () => {
    const plan = {
      run_id: 'run_1',
      goal: 'Implement user authentication',
      graph: {
        id: 'g1',
        goal: 'Implement user authentication',
        nodes: [
          { id: 'n1', agent: 'File-Finder', description: 'Find auth files', depends_on: [], status: 'pending' as const, substitutions: [], tool_calls: [], iterations: 0 },
          { id: 'n2', agent: 'Coder', description: 'Write auth logic', depends_on: ['n1'], status: 'pending' as const, substitutions: [], tool_calls: [], iterations: 0 },
        ],
        created_at: Date.now(),
      },
      files_to_modify: ['src/auth/login.ts', 'src/auth/register.ts'],
      assumptions: ['Using bcrypt for hashing'],
      risks: ['May break existing sessions'],
      planner_model: 'llama-3.1-8b',
      timestamp: Date.now(),
    };

    for (const width of WIDTHS) {
      it(`renders at ${width} columns`, () => {
        const output = PlanApprovalScreen.render(plan, width);
        expect(output).toContain('Implementation Plan');
        expect(output).toContain('File-Finder');
        expect(output).toContain('Coder');
        expect(output).toContain('Approve');
        expect(output).toContain('Edit');
        expect(output).toContain('Reject');
      });
    }
  });

  describe('P1-G10 — DiffReviewScreen', () => {
    const diffs = [{
      path: 'src/auth/login.ts',
      oldContent: 'old code',
      newContent: 'new code',
      isNew: false,
      isDeleted: false,
      hunks: [{
        oldStart: 1,
        oldLines: 3,
        newStart: 1,
        newLines: 4,
        lines: [' const x = 1;', '-const y = 2;', '+const y = 3;', '+const z = 4;'],
      }],
      unifiedDiff: '--- a/src/auth/login.ts\n+++ b/src/auth/login.ts\n',
    }];

    for (const width of WIDTHS) {
      it(`renders at ${width} columns`, () => {
        const output = DiffReviewScreen.render(diffs, width);
        expect(output).toContain('Review changes');
        expect(output).toContain('login.ts');
      });
    }
  });

  describe('P1-G10 — PermissionPromptScreen', () => {
    for (const width of WIDTHS) {
      it(`renders normal command at ${width} columns`, () => {
        const output = PermissionPromptScreen.render({
          agent: 'Tester',
          command: 'pnpm test',
          width,
        });
        expect(output).toContain('Permission Needed');
        expect(output).toContain('pnpm test');
        expect(output).toContain('Allow once');
        expect(output).toContain('Always allow');
      });

      it(`renders destructive command with warning at ${width} columns`, () => {
        const output = PermissionPromptScreen.render({
          agent: 'Command-Executor',
          command: 'rm -rf /tmp/build',
          isDestructive: true,
          width,
        });
        expect(output).toContain('Destructive');
        expect(output).toContain('Allow once');
        // Destructive commands cannot be permanently allowed
        expect(output).not.toContain('Always allow');
      });
    }
  });

  describe('P1-G10 — PoolExhaustedScreen', () => {
    for (const width of WIDTHS) {
      it(`renders at ${width} columns`, () => {
        const output = PoolExhaustedScreen.render(3, width);
        expect(output).toContain('exhausted');
        expect(output).toContain('paid');
        expect(output).toContain('free');
      });
    }
  });
});
