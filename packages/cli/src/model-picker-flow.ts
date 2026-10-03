import readline from 'node:readline';
import { FlappyEngine } from '@flappycode/core';
import { ModelPickerScreen, ModelPickerItem, Palette } from '@flappycode/tui';
import {
  getProjectConfigPath,
  setConfigValue,
  writeConfigFile,
} from '@flappycode/core';

export interface ModelPickerFlowOptions {
  input?: any;
  output?: any;
  isTTY?: boolean;
  promptPaidConfirm?: (modelId: string) => Promise<boolean>;
}

export interface ModelPickerResult {
  selectedModelId: string;
  changed: boolean;
  cancelled: boolean;
}

export async function runModelPickerFlow(
  engine: FlappyEngine,
  projectRoot: string,
  currentActiveModelId: string = 'flappyauto',
  options: ModelPickerFlowOptions = {}
): Promise<ModelPickerResult> {
  const models = engine.getModels();
  const input = options.input || process.stdin;
  const output = options.output || process.stdout;
  const isTTY =
    options.isTTY !== undefined
      ? options.isTTY
      : Boolean(input.isTTY ?? process.stdin.isTTY);

  if (models.length === 0) {
    output.write(Palette.bold('\nModel Catalog (0 models):\n'));
    output.write(
      Palette.subtle(
        'No models registered. Connect a provider first via /providers add or flappycode providers add.\n'
      )
    );
    return { selectedModelId: currentActiveModelId, changed: false, cancelled: true };
  }

  const screen = new ModelPickerScreen(models, currentActiveModelId);

  // Non-TTY fallback
  if (!isTTY) {
    output.write(screen.render(80) + '\n');
    output.write(Palette.subtle('(Non-interactive environment: model picker closed)\n'));
    return { selectedModelId: currentActiveModelId, changed: false, cancelled: true };
  }

  const prevRaw = Boolean(input.isRaw);
  const wasPaused = typeof input.isPaused === 'function' ? input.isPaused() : false;

  try {
    if (typeof input.setRawMode === 'function') {
      input.setRawMode(true);
    }
    if (typeof input.resume === 'function') {
      input.resume();
    }
    readline.emitKeypressEvents(input);

    return await new Promise<ModelPickerResult>((resolve) => {
      const renderScreen = () => {
        output.write('\x1b[2J\x1b[H');
        output.write(screen.render(80) + '\n');
      };

      renderScreen();

      const onKey = async (str: string, key: any) => {
        // Ctrl+C: exit 130
        if (key && key.ctrl && (key.name === 'c' || key.name === 'd')) {
          cleanup();
          if (options.input) {
            resolve({ selectedModelId: currentActiveModelId, changed: false, cancelled: true });
          } else {
            process.exit(130);
          }
          return;
        }

        // Esc or q: cancel
        if (key?.name === 'escape' || str === 'q' || str === 'Q') {
          cleanup();
          resolve({ selectedModelId: currentActiveModelId, changed: false, cancelled: true });
          return;
        }

        // Up arrow or k
        if (key?.name === 'up' || str === 'k' || str === 'K') {
          screen.clearStatus();
          screen.moveUp();
          renderScreen();
          return;
        }

        // Down arrow or j
        if (key?.name === 'down' || str === 'j' || str === 'J') {
          screen.clearStatus();
          screen.moveDown();
          renderScreen();
          return;
        }

        // Enter: select
        if (key?.name === 'return' || key?.name === 'enter' || str === '\r' || str === '\n') {
          const selected = screen.getSelected();

          // 1. Disabled tier check
          if (selected.tier === 'disabled') {
            screen.setStatus(
              `Cannot select disabled model '${selected.id}'. Untag via /models untag ${selected.model_id} to enable.`,
              'error'
            );
            renderScreen();
            return;
          }

          // 2. Paid tier PaidGate check
          if (selected.tier === 'paid') {
            const allowed = engine.config.model_policy.allow_paid_models;
            if (!allowed) {
              if (options.promptPaidConfirm) {
                const confirmed = await options.promptPaidConfirm(selected.model_id);
                if (!confirmed) {
                  screen.setStatus(
                    `Paid model '${selected.id}' was refused. Active model unchanged.`,
                    'warn'
                  );
                  renderScreen();
                  return;
                }
              } else {
                screen.setStatus(
                  `Paid model '${selected.id}' is blocked by PaidGate. Set allow_paid_models to true to enable.`,
                  'error'
                );
                renderScreen();
                return;
              }
            }
          }

          cleanup();
          const targetId = selected.id;

          // Persist choice to config
          try {
            const projectPath = getProjectConfigPath(projectRoot);
            const updated = setConfigValue(engine.config, 'model_policy.default_model', targetId);
            writeConfigFile(projectPath, updated);
          } catch {
            // Non-fatal if config write fails
          }

          output.write('\x1b[2J\x1b[H');
          output.write(
            Palette.ok(
              `\n✔ Active model set to: ${targetId}${
                targetId === 'flappyauto' ? ' (multi-agent orchestration)' : ''
              }\n`
            )
          );
          resolve({ selectedModelId: targetId, changed: true, cancelled: false });
        }
      };

      function cleanup() {
        input.off('keypress', onKey);
      }

      input.on('keypress', onKey);
    });
  } finally {
    try {
      if (typeof input.setRawMode === 'function') {
        input.setRawMode(prevRaw);
      }
      if (wasPaused && typeof input.pause === 'function') {
        input.pause();
      }
    } catch {}
  }
}
