import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { EventEmitter } from 'node:events';
import { ModelPickerScreen } from '../../packages/tui/src/screens/model-picker';
import { Model } from '@flappycode/protocol';
import { FlappyEngine } from '../../packages/core/src/engine';
import { runModelPickerFlow } from '../../packages/cli/src/model-picker-flow';
import { getProjectConfigPath } from '../../packages/core/src/config/config-loader';

describe('GAP-REM-02: Interactive Model Picker Selection', () => {
  let tmpDir: string;
  const mockModels: Model[] = [
    {
      provider_id: 'mock',
      model_id: 'mock-coder-free',
      tier: 'free',
      is_local: false,
      context_length: 32768,
      price_in: 0,
      price_out: 0,
      supports_tools: true,
      supports_vision: false,
      tier_source: 'metadata',
      data_use_policy: 'no_training',
      modality: 'text->text',
      tool_probe_passed: true,
      avg_latency_ms: 100,
      last_validated_at: 1000,
      is_pinned: false,
    },
    {
      provider_id: 'mock',
      model_id: 'mock-expensive-paid',
      tier: 'paid',
      is_local: false,
      context_length: 128000,
      price_in: 10,
      price_out: 30,
      supports_tools: true,
      supports_vision: false,
      tier_source: 'metadata',
      data_use_policy: 'no_training',
      modality: 'text->text',
      tool_probe_passed: true,
      avg_latency_ms: 200,
      last_validated_at: 1000,
      is_pinned: false,
    },
    {
      provider_id: 'mock',
      model_id: 'mock-disabled',
      tier: 'disabled',
      is_local: false,
      context_length: 16384,
      price_in: 0,
      price_out: 0,
      supports_tools: true,
      supports_vision: false,
      tier_source: 'override',
      data_use_policy: 'unknown',
      modality: 'text->text',
      tool_probe_passed: false,
      avg_latency_ms: 0,
      last_validated_at: 1000,
      is_pinned: false,
    },
  ];

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'flappy-gap-rem-02-'));
  });

  afterEach(() => {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {}
  });

  describe('ModelPickerScreen Navigation & Boundary Tests', () => {
    it('initializes with flappyauto as row 0 and cursor at 0', () => {
      const screen = new ModelPickerScreen(mockModels, 'flappyauto');
      expect(screen.cursorIndex).toBe(0);
      expect(screen.getSelected().id).toBe('flappyauto');
      expect(screen.getItems().length).toBe(4); // flappyauto + 3 models
    });

    it('navigates down and wraps to 0 at the end', () => {
      const screen = new ModelPickerScreen(mockModels, 'flappyauto');
      expect(screen.cursorIndex).toBe(0);

      screen.moveDown();
      expect(screen.cursorIndex).toBe(1);
      expect(screen.getSelected().id).toBe('mock/mock-coder-free');

      screen.moveDown();
      expect(screen.cursorIndex).toBe(2);
      expect(screen.getSelected().id).toBe('mock/mock-expensive-paid');

      screen.moveDown();
      expect(screen.cursorIndex).toBe(3);
      expect(screen.getSelected().id).toBe('mock/mock-disabled');

      // Wrap around
      screen.moveDown();
      expect(screen.cursorIndex).toBe(0);
      expect(screen.getSelected().id).toBe('flappyauto');
    });

    it('navigates up and wraps to end when at 0', () => {
      const screen = new ModelPickerScreen(mockModels, 'flappyauto');
      expect(screen.cursorIndex).toBe(0);

      // Move up wraps to last item
      screen.moveUp();
      expect(screen.cursorIndex).toBe(3);
      expect(screen.getSelected().id).toBe('mock/mock-disabled');

      screen.moveUp();
      expect(screen.cursorIndex).toBe(2);
      expect(screen.getSelected().id).toBe('mock/mock-expensive-paid');
    });

    it('renders cursor indicator and marks active model correctly', () => {
      const screen = new ModelPickerScreen(mockModels, 'mock/mock-coder-free');
      // Cursor starts on active model
      expect(screen.cursorIndex).toBe(1);

      const rendered = screen.render(80);
      expect(rendered).toContain('Choose model');
      expect(rendered).toContain('mock/mock-coder-free');
      expect(rendered).toContain('[ACTIVE]');
      expect(rendered).toContain('FREE MODELS');
      expect(rendered).toContain('PAID MODELS');
      expect(rendered).toContain('DISABLED MODELS');
    });
  });

  describe('runModelPickerFlow CLI-level Tests', () => {
    class MockStdin extends EventEmitter {
      public isTTY = true;
      public isRaw = false;
      public setRawMode(val: boolean) {
        this.isRaw = val;
      }
      public resume() {}
      public pause() {}
    }

    class MockStdout {
      public output = '';
      public write(str: string) {
        this.output += str;
        return true;
      }
    }

    it('selects model on Down + Enter, persists config, and sets active model', async () => {
      const engine = new FlappyEngine({
        projectRoot: tmpDir,
        dbPath: path.join(tmpDir, 'test.db'),
      });
      await engine.addProvider({
        id: 'mock',
        type: 'mock',
        display_name: 'Mock Provider',
        enabled: true,
        data_use_policy: 'unknown',
      });

      const stdin = new MockStdin();
      const stdout = new MockStdout();

      const flowPromise = runModelPickerFlow(engine, tmpDir, 'flappyauto', {
        input: stdin,
        output: stdout,
        isTTY: true,
      });

      // Simulate keypress sequence: Down, then Enter
      setTimeout(() => {
        stdin.emit('keypress', '', { name: 'down' });
        setTimeout(() => {
          stdin.emit('keypress', '', { name: 'return' });
        }, 10);
      }, 10);

      const result = await flowPromise;
      expect(result.changed).toBe(true);
      expect(result.cancelled).toBe(false);
      // First model in mock catalog is mock-analyst-free
      expect(result.selectedModelId).toBe('mock/mock-analyst-free');

      // Verify raw mode was restored to false
      expect(stdin.isRaw).toBe(false);

      // Verify choice was persisted to project config
      const projectConfig = getProjectConfigPath(tmpDir);
      expect(fs.existsSync(projectConfig)).toBe(true);
      const saved = JSON.parse(fs.readFileSync(projectConfig, 'utf8'));
      expect(saved.model_policy.default_model).toBe('mock/mock-analyst-free');
    });

    it('cancels on Escape key without changing active model or persisting config', async () => {
      const engine = new FlappyEngine({
        projectRoot: tmpDir,
        dbPath: path.join(tmpDir, 'test.db'),
      });
      await engine.addProvider({
        id: 'mock',
        type: 'mock',
        display_name: 'Mock Provider',
        enabled: true,
        data_use_policy: 'unknown',
      });

      const stdin = new MockStdin();
      const stdout = new MockStdout();

      const flowPromise = runModelPickerFlow(engine, tmpDir, 'flappyauto', {
        input: stdin,
        output: stdout,
        isTTY: true,
      });

      // Simulate down, then escape
      setTimeout(() => {
        stdin.emit('keypress', '', { name: 'down' });
        setTimeout(() => {
          stdin.emit('keypress', '', { name: 'escape' });
        }, 10);
      }, 10);

      const result = await flowPromise;
      expect(result.changed).toBe(false);
      expect(result.cancelled).toBe(true);
      expect(result.selectedModelId).toBe('flappyauto');
      expect(stdin.isRaw).toBe(false);
    });

    it('enforces PaidGate: refuses paid model if user declines confirmation', async () => {
      const engine = new FlappyEngine({
        projectRoot: tmpDir,
        dbPath: path.join(tmpDir, 'test.db'),
      });
      await engine.addProvider({
        id: 'mock',
        type: 'mock',
        display_name: 'Mock Provider',
        enabled: true,
        data_use_policy: 'unknown',
      });

      const stdin = new MockStdin();
      const stdout = new MockStdout();

      // Ensure allow_paid_models is false
      expect(engine.config.model_policy.allow_paid_models).toBe(false);

      const promptPaidConfirm = vi.fn().mockResolvedValue(false); // User says NO

      const flowPromise = runModelPickerFlow(engine, tmpDir, 'flappyauto', {
        input: stdin,
        output: stdout,
        isTTY: true,
        promptPaidConfirm,
      });

      // Navigate to mock-expensive-paid (index 5: flappyauto=0, 4 free models=1..4, paid=5)
      setTimeout(() => {
        for (let i = 0; i < 5; i++) {
          stdin.emit('keypress', '', { name: 'down' });
        }
        // Press enter on paid model
        setTimeout(() => {
          stdin.emit('keypress', '', { name: 'return' });
          // Then escape out
          setTimeout(() => {
            stdin.emit('keypress', '', { name: 'escape' });
          }, 30);
        }, 30);
      }, 10);

      const result = await flowPromise;
      expect(promptPaidConfirm).toHaveBeenCalled();
      expect(result.changed).toBe(false);
      expect(result.selectedModelId).toBe('flappyauto');
      expect(stdout.output).toContain('Paid model');
    });

    it('handles non-TTY environment gracefully without hanging', async () => {
      const engine = new FlappyEngine({
        projectRoot: tmpDir,
        dbPath: path.join(tmpDir, 'test.db'),
      });
      await engine.addProvider({
        id: 'mock',
        type: 'mock',
        display_name: 'Mock Provider',
        enabled: true,
        data_use_policy: 'unknown',
      });

      const stdin = new MockStdin();
      stdin.isTTY = false;
      const stdout = new MockStdout();

      const result = await runModelPickerFlow(engine, tmpDir, 'flappyauto', {
        input: stdin,
        output: stdout,
        isTTY: false,
      });

      expect(result.cancelled).toBe(true);
      expect(stdout.output).toContain('Non-interactive environment: model picker closed');
    });
  });
});
