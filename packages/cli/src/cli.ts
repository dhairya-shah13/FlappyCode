#!/usr/bin/env node

// Suppress Node.js experimental warnings (e.g. SQLite DatabaseSync in Node 24)
const originalEmitWarning = process.emitWarning;
process.emitWarning = (warning: any, ...args: any[]) => {
  if (typeof warning === 'string' && warning.includes('SQLite is an experimental feature')) return;
  if (warning && typeof warning === 'object' && warning.message?.includes('SQLite is an experimental feature')) return;
  return (originalEmitWarning as any).call(process, warning, ...args);
};

import { Command } from 'commander';
import readline from 'node:readline';
import { FlappyEngine } from '@flappycode/core';
import { FlappyServer } from '@flappycode/server';
import {
  HomeScreen,
  ModelPickerScreen,
  OnboardingWizardScreen,
  Palette,
  PlanApprovalScreen,
  DiffReviewScreen,
  PermissionPromptScreen,
  PoolExhaustedScreen,
} from '@flappycode/tui';

const program = new Command();

program
  .name('flappycode')
  .description('Multi-provider, multi-agent free model aggregator and coding assistant')
  .version('0.1.0');

// Default action: Launch interactive TUI
program.action(async () => {
  const engine = new FlappyEngine();
  const getWidth = () => process.stdout.columns || 100;

  const waitForAnyKey = (): Promise<void> => {
    return new Promise((resolve) => {
      process.stdout.write(Palette.subtle('\nPress any key to return to home...\n'));
      if (!process.stdin.isTTY) {
        resolve();
        return;
      }
      process.stdin.setRawMode(true);
      process.stdin.resume();
      const onKey = (_str: any, key: any) => {
        if (key && key.ctrl && (key.name === 'c' || key.name === 'd')) {
          process.stdin.setRawMode(false);
          process.exit(0);
        }
        process.stdin.off('keypress', onKey);
        resolve();
      };
      process.stdin.once('keypress', onKey);
    });
  };

  const promptSingleLine = (promptText: string): Promise<string> => {
    return new Promise((resolve) => {
      process.stdin.setRawMode(false);
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
      });
      rl.question(promptText, (answer) => {
        rl.close();
        resolve(answer);
      });
    });
  };

  const promptPlanDecision = (): Promise<'approve' | 'edit' | 'reject'> => {
    return new Promise((resolve) => {
      if (!process.stdin.isTTY) {
        resolve('approve');
        return;
      }
      process.stdin.setRawMode(true);
      process.stdin.resume();

      const onKey = (str: any, key: any) => {
        if (key && key.ctrl && (key.name === 'c' || key.name === 'd')) {
          cleanup();
          process.exit(0);
        }
        if (key && (key.name === 'return' || key.name === 'enter') || str === 'y' || str === 'Y') {
          process.stdin.off('keypress', onKey);
          resolve('approve');
          return;
        }
        if ((key && key.name === 'escape') || str === 'q' || str === 'Q' || str === 'n' || str === 'N') {
          process.stdin.off('keypress', onKey);
          resolve('reject');
          return;
        }
        if (str === 'e' || str === 'E') {
          process.stdin.off('keypress', onKey);
          resolve('edit');
          return;
        }
      };
      process.stdin.on('keypress', onKey);
    });
  };

  // Fallback for non-TTY (pipes, scripts, CI)
  if (!process.stdin.isTTY) {
    const providers = engine.providerRepo.listEnabled();
    const freeCount = engine.getFreeModelsCount();
    console.log(HomeScreen.render({
      status: {
        version: '0.1.0',
        connectedProviders: providers.length,
        freeModelsAvailable: freeCount,
        state: providers.length === 0 ? 'no_providers' : 'ready',
        width: getWidth(),
      },
      width: getWidth(),
    }));

    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      prompt: `${Palette.cyan(Palette.bold('>_ '))} `,
    });
    rl.prompt();
    rl.on('line', async (line) => {
      const input = line.trim();
      if (!input) {
        rl.prompt();
        return;
      }
      if (input === '/exit' || input === '/quit') {
        rl.close();
        process.exit(0);
      }
      try {
        const plan = await engine.submitPrompt(input);
        console.error(
          Palette.yellow(
            '✖ Approval required: Non-interactive piped execution requires plan approval. Use "flappycode run --approve-plan <prompt>".'
          )
        );
        process.exit(3);
      } catch (err: any) {
        console.error(Palette.error(`✖ Task error: ${err.message}`));
        process.exit(1);
      }
    });
    return;
  }

  // Interactive in-box TUI loop
  readline.emitKeypressEvents(process.stdin);
  process.stdin.setRawMode(true);
  process.stdin.resume();

  let currentInput = '';
  let cursorPos = 0;
  let isExecuting = false;

  const redraw = () => {
    if (isExecuting) return;
    const w = getWidth();
    const providers = engine.providerRepo.listEnabled();
    const freeCount = engine.getFreeModelsCount();

    if (providers.length === 0) {
      const layout = HomeScreen.renderLayout({
        status: {
          version: '0.1.0',
          connectedProviders: 0,
          freeModelsAvailable: 0,
          state: 'no_providers',
          width: w,
        },
        width: w,
        inputPrompt: currentInput,
        cursorPos,
      });

      process.stdout.write('\x1b[2J\x1b[H');
      process.stdout.write(layout.output + '\n\n' + OnboardingWizardScreen.render(w));
      process.stdout.write(`\x1b[${layout.cursorRow};${layout.cursorCol}H`);
      return;
    }

    const layout = HomeScreen.renderLayout({
      status: {
        version: '0.1.0',
        connectedProviders: providers.length,
        freeModelsAvailable: freeCount,
        state: 'ready',
        width: w,
      },
      width: w,
      inputPrompt: currentInput,
      cursorPos,
    });

    // Clear viewport and move to top-left
    process.stdout.write('\x1b[2J\x1b[H');
    process.stdout.write(layout.output);
    // Park hardware cursor inside the box
    process.stdout.write(`\x1b[${layout.cursorRow};${layout.cursorCol}H`);
  };

  const handleResize = () => redraw();
  process.stdout.on('resize', handleResize);

  const cleanup = () => {
    if (process.stdin.isTTY) {
      process.stdin.setRawMode(false);
    }
    process.stdout.off('resize', handleResize);
    process.stdout.write('\x1b[?25h');
  };
  process.on('exit', cleanup);

  redraw();

  process.stdin.on('keypress', async (str, key) => {
    if (isExecuting) return;

    if (key && key.ctrl && (key.name === 'c' || key.name === 'd')) {
      cleanup();
      process.exit(0);
    }

    if (key && (key.name === 'return' || key.name === 'enter')) {
      const line = currentInput.trim();
      currentInput = '';
      cursorPos = 0;
      if (!line) {
        redraw();
        return;
      }

      isExecuting = true;
      process.stdin.setRawMode(false);

      if (line === '/exit' || line === '/quit') {
        cleanup();
        process.exit(0);
      }

      if (line === '/models') {
        process.stdout.write('\x1b[2J\x1b[H');
        const models = engine.getModels();
        if (models.length === 0) {
          console.log(Palette.bold('\nModel Catalog (0 models):'));
          console.log(Palette.subtle('No models registered. Connect a provider first via /providers add or flappycode providers add.'));
        } else {
          console.log(ModelPickerScreen.render(models, 0, getWidth()));
        }
        await waitForAnyKey();
        process.stdin.setRawMode(true);
        isExecuting = false;
        redraw();
        return;
      }

      if (line === '/providers') {
        process.stdout.write('\x1b[2J\x1b[H');
        const provs = engine.providerRepo.listAll();
        if (provs.length === 0) {
          console.log(Palette.bold('\nConnected Providers (0):'));
          console.log(Palette.subtle('No providers connected. Use /providers add to connect a provider.'));
        } else {
          console.log(`\nConnected providers (${provs.length}):`);
          for (const p of provs) {
            console.log(`  - ${p.display_name} (${p.type}) [${p.enabled ? 'enabled' : 'disabled'}]`);
          }
        }
        console.log(Palette.dim('\nCommands: /providers add, /providers remove <id>, /providers refresh'));
        await waitForAnyKey();
        process.stdin.setRawMode(true);
        isExecuting = false;
        redraw();
        return;
      }

      if (line === '/providers add' || line.startsWith('/providers add')) {
        process.stdout.write('\x1b[2J\x1b[H');
        console.log(Palette.bold('\nConnect a Provider to FlappyCode'));
        console.log(Palette.subtle('Supported types: openrouter, groq, ollama, google, anthropic, openai-compatible\n'));

        const type = await promptSingleLine('Provider type (e.g. openrouter / ollama / groq / google): ');
        if (!type.trim()) {
          console.log(Palette.yellow('Cancelled.'));
          await waitForAnyKey();
          process.stdin.setRawMode(true);
          isExecuting = false;
          redraw();
          return;
        }

        const name = await promptSingleLine(`Display name [default: ${type.trim()}]: `);
        const displayName = name.trim() || type.trim();

        let baseUrl: string | undefined;
        if (type.trim().toLowerCase() === 'ollama') {
          const urlInput = await promptSingleLine('Ollama URL [default: http://localhost:11434]: ');
          baseUrl = urlInput.trim() || 'http://localhost:11434';
        } else if (type.trim().toLowerCase() === 'openai-compatible') {
          baseUrl = await promptSingleLine('Base URL (e.g. http://localhost:1234/v1): ');
        }

        let key: string | undefined;
        if (type.trim().toLowerCase() !== 'ollama') {
          key = await promptSingleLine('API key: ');
        }

        const id = displayName.toLowerCase().replace(/\s+/g, '-');
        const cfg = {
          id,
          type: type.trim().toLowerCase(),
          display_name: displayName,
          base_url: baseUrl,
          enabled: true,
          max_concurrency: 4,
          data_use_policy: 'unknown' as const,
          created_at: Date.now(),
        };

        try {
          console.log(`\nConnecting and discovering models for '${displayName}'...`);
          const models = await engine.addProvider(cfg, key?.trim());
          const freeCount = models.filter((m) => m.tier === 'free' || m.tier === 'rate_limited_free').length;
          console.log(
            Palette.ok(
              `✔ Successfully connected '${displayName}': discovered ${models.length} models (${freeCount} free/rate-limited-free)`
            )
          );
        } catch (err: any) {
          console.log(Palette.error(`✖ Failed to connect provider: ${err.message}`));
        }

        await waitForAnyKey();
        process.stdin.setRawMode(true);
        isExecuting = false;
        redraw();
        return;
      }

      if (line.startsWith('/providers remove ')) {
        const idToRemove = line.replace('/providers remove ', '').trim();
        process.stdout.write('\x1b[2J\x1b[H');
        engine.providerRepo.delete(idToRemove);
        await engine.secretStore.deleteSecret(idToRemove);
        console.log(Palette.ok(`✔ Removed provider '${idToRemove}' and deleted its credentials.`));
        await waitForAnyKey();
        process.stdin.setRawMode(true);
        isExecuting = false;
        redraw();
        return;
      }

      if (line === '/undo') {
        process.stdout.write('\x1b[2J\x1b[H');
        const res = engine.undo();
        if (res.success) {
          console.log(Palette.ok(`✔ Reverted last change batch: ${res.restoredFiles.join(', ')}`));
        } else {
          console.log(Palette.error(`✖ ${res.error}`));
        }
        await waitForAnyKey();
        process.stdin.setRawMode(true);
        isExecuting = false;
        redraw();
        return;
      }

      if (line === '/rules') {
        process.stdout.write('\x1b[2J\x1b[H');
        const rules = engine.rulesLoader.loadRules();
        console.log(`\nActive RULES.md:\n${rules.universalRules.slice(0, 500)}...\n`);
        await waitForAnyKey();
        process.stdin.setRawMode(true);
        isExecuting = false;
        redraw();
        return;
      }

      if (line.startsWith('/')) {
        process.stdout.write('\x1b[2J\x1b[H');
        console.log(`Available slash commands: /models, /providers, /providers add, /undo, /rules, /exit`);
        await waitForAnyKey();
        process.stdin.setRawMode(true);
        isExecuting = false;
        redraw();
        return;
      }

      // Check if providers are connected before running any prompt
      const enabledProviders = engine.providerRepo.listEnabled();
      if (enabledProviders.length === 0) {
        process.stdout.write('\x1b[2J\x1b[H');
        console.log(Palette.bold(Palette.yellow('FLAPPY') + Palette.cyan('CODE')) + ' ' + Palette.subtle('— No Providers Connected'));
        console.log(Palette.yellow('\n✖ No providers connected yet.'));
        console.log('FlappyCode requires at least one connected provider to find and route to free models.');
        console.log('\nTo connect a provider:');
        console.log(`  - Type ${Palette.cyan('/providers add')} in this interactive prompt`);
        console.log(`  - Or run: ${Palette.cyan('flappycode providers add openrouter --key <API_KEY>')}`);
        console.log(`            ${Palette.cyan('flappycode providers add ollama --url http://localhost:11434')}`);
        console.log(`            ${Palette.cyan('flappycode providers add groq --key <API_KEY>')}`);
        console.log(`            ${Palette.cyan('flappycode providers add google --key <API_KEY>')}`);
        await waitForAnyKey();
        process.stdin.setRawMode(true);
        isExecuting = false;
        redraw();
        return;
      }

      // Prompt execution: Collapse header per CLIDesign.md §4.1
      process.stdout.write('\x1b[2J\x1b[H');
      console.log(Palette.bold(Palette.yellow('FLAPPY') + Palette.cyan('CODE')) + ' ' + Palette.subtle('— Task Execution'));
      console.log(Palette.cyan(`\nProcessing request with flappyauto: "${line}"...`));
      try {
        const plan = await engine.submitPrompt(line);
        process.stdout.write('\x1b[2J\x1b[H');
        console.log(PlanApprovalScreen.render(plan, getWidth()));

        const executeWithProgress = async (runId: string) => {
          const onStarted = (ev: any) => {
            console.log(Palette.cyan(`\n◐ [${ev.node.agent}] ${ev.node.description.slice(0, 70)}...`));
          };
          const onFinished = (ev: any) => {
            if (ev.node.status === 'failed') {
              console.log(Palette.error(`✖ [${ev.node.agent}] failed: ${ev.node.error}`));
            } else {
              const summary = ev.node.tool_calls?.map((tc: any) => tc.result_summary).join(', ');
              console.log(Palette.ok(`✔ [${ev.node.agent}] completed${summary ? ` (${summary})` : ''}`));
            }
          };
          const onModel = (ev: any) => {
            console.log(Palette.dim(`  Routed to ${ev.model.model_id} (${ev.model.tier})`));
          };
          const onDiff = (ev: any) => {
            for (const d of ev.proposal.diffs) {
              console.log(Palette.cyan(`  ✎ Staged changes: ${d.path} (${d.hunks.length} hunk(s))`));
            }
          };

          const unsubs = [
            engine.eventBus.on('node.started', onStarted),
            engine.eventBus.on('node.finished', onFinished),
            engine.eventBus.on('model.selected', onModel),
            engine.eventBus.on('diff.ready', onDiff),
          ];

          const onDiffApprovalRequired = async (proposal: any): Promise<boolean> => {
            console.log('\n' + DiffReviewScreen.render(proposal.diffs, getWidth()));
            console.log(Palette.bold('Approve diff? [ ↵ / a / y Apply ]  [ Esc / n Deny ]'));
            return new Promise((resolve) => {
              const onKey = (_ch: string, key: any) => {
                if (key?.name === 'y' || key?.name === 'return' || key?.name === 'a') {
                  process.stdin.removeListener('keypress', onKey);
                  resolve(true);
                } else if (key?.name === 'n' || key?.name === 'escape' || key?.name === 'q') {
                  process.stdin.removeListener('keypress', onKey);
                  resolve(false);
                }
              };
              process.stdin.on('keypress', onKey);
            });
          };

          const onPermissionApprovalRequired = async (req: {
            agent: string;
            command: string;
            reason?: string;
            isDestructive?: boolean;
          }): Promise<'allow' | 'always' | 'deny'> => {
            console.log(
              '\n' +
                PermissionPromptScreen.render({
                  agent: req.agent,
                  command: req.command,
                  isDestructive: req.isDestructive,
                  reason: req.reason,
                  width: getWidth(),
                })
            );
            return new Promise((resolve) => {
              const onKey = (_ch: string, key: any) => {
                if (key?.name === 'y' || key?.name === 'return') {
                  process.stdin.removeListener('keypress', onKey);
                  resolve('allow');
                } else if (key?.name === 'a' && !req.isDestructive) {
                  process.stdin.removeListener('keypress', onKey);
                  resolve('always');
                } else if (key?.name === 'n' || key?.name === 'escape') {
                  process.stdin.removeListener('keypress', onKey);
                  resolve('deny');
                }
              };
              process.stdin.on('keypress', onKey);
            });
          };

          try {
            await engine.executePlan(runId, onDiffApprovalRequired, onPermissionApprovalRequired);
            console.log(Palette.ok(`\n✔ Task completed successfully!`));
          } finally {
            unsubs.forEach((unsub) => {
              try { unsub(); } catch {}
            });
          }
        };

        // Mandatory user approval (Rule 2.2 of RULES.md & CLIDesign.md §5.6)
        const decision = await promptPlanDecision();
        if (decision === 'approve') {
          console.log(Palette.ok(`\n✔ Plan approved by user. Executing task DAG...`));
          engine.approvePlan(plan.run_id);
          await executeWithProgress(plan.run_id);
        } else if (decision === 'edit') {
          console.log(Palette.yellow(`\nPlan edit requested. Please provide refinement instructions:`));
          const refinement = await promptSingleLine('>_ ');
          if (refinement.trim()) {
            console.log(Palette.cyan(`\nRe-planning with updated instructions...`));
            const newPlan = await engine.submitPrompt(`${line}\nRefinement: ${refinement.trim()}`);
            process.stdout.write('\x1b[2J\x1b[H');
            console.log(PlanApprovalScreen.render(newPlan, getWidth()));
            const secondDecision = await promptPlanDecision();
            if (secondDecision === 'approve') {
              console.log(Palette.ok(`\n✔ Revised plan approved. Executing task...`));
              engine.approvePlan(newPlan.run_id);
              await executeWithProgress(newPlan.run_id);
            } else {
              console.log(Palette.yellow(`\n✖ Plan rejected. Run cancelled. No files were modified.`));
            }
          }
        } else {
          console.log(Palette.yellow(`\n✖ Plan rejected by user. Run cancelled. No files were modified.`));
        }
      } catch (err: any) {
        console.log(Palette.error(`\n✖ Task error: ${err.message}`));
      }

      await waitForAnyKey();
      process.stdin.setRawMode(true);
      isExecuting = false;
      redraw();
      return;
    }

    if (key && key.name === 'backspace') {
      if (cursorPos > 0) {
        currentInput = currentInput.slice(0, cursorPos - 1) + currentInput.slice(cursorPos);
        cursorPos--;
        redraw();
      }
      return;
    }

    if (key && key.name === 'delete') {
      if (cursorPos < currentInput.length) {
        currentInput = currentInput.slice(0, cursorPos) + currentInput.slice(cursorPos + 1);
        redraw();
      }
      return;
    }

    if (key && key.name === 'left') {
      if (cursorPos > 0) {
        cursorPos--;
        redraw();
      }
      return;
    }

    if (key && key.name === 'right') {
      if (cursorPos < currentInput.length) {
        cursorPos++;
        redraw();
      }
      return;
    }

    if (key && key.name === 'home') {
      cursorPos = 0;
      redraw();
      return;
    }

    if (key && key.name === 'end') {
      cursorPos = currentInput.length;
      redraw();
      return;
    }

    // Normal typing: insert character or pasted string at cursor
    if (str && (!key || (!key.ctrl && !key.meta))) {
      currentInput = currentInput.slice(0, cursorPos) + str + currentInput.slice(cursorPos);
      cursorPos += str.length;
      redraw();
    }
  });
});

// Headless run command
program
  .command('run <prompt>')
  .description('Run a single task non-interactively (headless mode)')
  .option('--model <id>', 'Specific model ID or flappyauto', 'flappyauto')
  .option('--approve-plan', 'Explicitly approve the implementation plan (mandatory for writes)')
  .option('--json', 'Output newline-delimited protocol events')
  .option('--cwd <path>', 'Working directory', process.cwd())
  .action(async (prompt, options) => {
    const engine = new FlappyEngine({ projectRoot: options.cwd });

    if (options.json) {
      engine.eventBus.onAny((ev) => {
        console.log(JSON.stringify(ev));
      });
    }

    try {
      const providers = engine.providerRepo.listEnabled();
      if (providers.length === 0) {
        if (!options.json) console.error(Palette.error('✖ Error: No providers connected.'));
        process.exit(5);
      }

      const plan = await engine.submitPrompt(prompt);

      // Without --approve-plan, exit code 3 is mandatory per SRS FR-RUL-009 & CLIDesign.md §5.1
      if (!options.approvePlan) {
        if (!options.json) {
          console.error(
            Palette.yellow(
              '✖ Approval required: Headless execution requires explicit --approve-plan flag.'
            )
          );
        }
        process.exit(3);
      }

      engine.approvePlan(plan.run_id);
      await engine.executePlan(plan.run_id);

      if (!options.json) {
        console.log(Palette.ok(`✔ Done: Completed task "${plan.goal}"`));
      }
      process.exit(0);
    } catch (err: any) {
      if (err.message?.includes('pool is exhausted')) {
        if (!options.json) console.error(Palette.error('✖ Free model pool exhausted.'));
        process.exit(4);
      }
      if (!options.json) console.error(Palette.error(`✖ Task failed: ${err.message}`));
      process.exit(1);
    }
  });

// Local loopback serve command
program
  .command('serve')
  .description('Start local loopback HTTP/SSE server (flappycode serve)')
  .option('--port <number>', 'Port to bind', '4477')
  .action(async (options) => {
    const engine = new FlappyEngine();
    const port = parseInt(options.port, 10);
    const server = new FlappyServer(engine, { port });

    await server.start();
    console.log(Palette.ok(`✔ FlappyCode server listening on http://${server.host}:${server.port}`));
    console.log(`Bearer token: ${Palette.bold(server.bearerToken)}`);
    console.log(Palette.dim('CORS is disabled. Bound strictly to loopback 127.0.0.1.'));
  });

// Providers command
const providersCmd = program.command('providers').description('Manage connected providers');

providersCmd
  .command('list')
  .description('List configured providers')
  .action(() => {
    const engine = new FlappyEngine();
    const list = engine.providerRepo.listAll();
    console.log(`Configured providers (${list.length}):`);
    for (const p of list) {
      console.log(`  ${p.id} (${p.display_name}) - type: ${p.type} [${p.enabled ? 'enabled' : 'disabled'}]`);
    }
  });

providersCmd
  .command('add <type>')
  .description('Add a new provider (e.g. openrouter, groq, ollama, mock)')
  .option('--name <name>', 'Display name')
  .option('--key <key>', 'API key')
  .option('--url <url>', 'Base URL')
  .action(async (type, options) => {
    const engine = new FlappyEngine();
    const id = options.name?.toLowerCase().replace(/\s+/g, '-') || type;
    const cfg = {
      id,
      type,
      display_name: options.name || type,
      base_url: options.url,
      enabled: true,
      max_concurrency: 4,
      data_use_policy: 'unknown' as const,
      created_at: Date.now(),
    };

    try {
      console.log(`Adding and discovering models for '${cfg.display_name}'...`);
      const models = await engine.addProvider(cfg, options.key);
      const freeCount = models.filter((m) => m.tier === 'free' || m.tier === 'rate_limited_free').length;
      console.log(
        Palette.ok(
          `✔ ${cfg.display_name} connected: ${models.length} models discovered (${freeCount} free/rate-limited-free)`
        )
      );
    } catch (err: any) {
      console.error(Palette.error(`✖ Failed to add provider: ${err.message}`));
      process.exit(1);
    }
  });

providersCmd
  .command('remove <id>')
  .description('Remove a provider and delete its stored secrets')
  .action(async (id) => {
    const engine = new FlappyEngine();
    engine.providerRepo.delete(id);
    await engine.secretStore.deleteSecret(id);
    console.log(Palette.ok(`✔ Removed provider '${id}' and deleted stored credentials.`));
  });

providersCmd
  .command('refresh')
  .description('Refresh model discovery for all enabled providers')
  .action(async () => {
    const engine = new FlappyEngine();
    console.log('Refreshing provider catalogs...');
    await engine.refreshProviders();
    console.log(Palette.ok(`✔ Catalogs refreshed. Free models available: ${engine.getFreeModelsCount()}`));
  });

providersCmd
  .command('enable <id>')
  .description('Enable a disabled provider')
  .action((id) => {
    const engine = new FlappyEngine();
    engine.providerRepo.setEnabled(id, true);
    console.log(Palette.ok(`✔ Enabled provider '${id}'`));
  });

providersCmd
  .command('disable <id>')
  .description('Disable a provider')
  .action((id) => {
    const engine = new FlappyEngine();
    engine.providerRepo.setEnabled(id, false);
    console.log(Palette.ok(`✔ Disabled provider '${id}'`));
  });

// Models command
program
  .command('models')
  .description('List available models in the unified catalog')
  .option('--free', 'Show only free / rate-limited-free models')
  .option('--provider <id>', 'Filter by provider')
  .option('--tier <tier>', 'Filter by tier (free, rate_limited_free, paid)')
  .option('--json', 'Output as JSON')
  .action((options) => {
    const engine = new FlappyEngine();
    let models = engine.getModels();

    if (options.free) {
      models = models.filter((m) => m.tier === 'free' || m.tier === 'rate_limited_free');
    }
    if (options.provider) {
      models = models.filter((m) => m.provider_id === options.provider);
    }
    if (options.tier) {
      models = models.filter((m) => m.tier === options.tier);
    }

    if (options.json) {
      console.log(JSON.stringify(models, null, 2));
      return;
    }

    console.log(`\nModels (${models.length}):`);
    for (const m of models) {
      const tierTag = m.tier === 'free' ? Palette.ok('free') : m.tier === 'rate_limited_free' ? Palette.subtle('rate-limited-free') : Palette.orange('paid');
      console.log(`  ${m.provider_id}/${m.model_id} [${tierTag}] (${(m.context_length / 1024).toFixed(0)}k ctx)`);
    }
  });

// Doctor command
program
  .command('doctor')
  .description('Diagnose environment, keychain, database, and providers')
  .action(async () => {
    const engine = new FlappyEngine();
    const doc = await engine.doctor();
    console.log(Palette.bold('\nFlappyCode Diagnostics:'));
    console.log(`  Node.js Version:       ${Palette.ok(doc.nodeVersion)} (≥ 20 required)`);
    console.log(`  Database Storage:      ${doc.dbOpen ? Palette.ok('Connected (WAL mode)') : Palette.error('Closed')}`);
    console.log(`  Secret Store:          ${doc.keychainActive ? Palette.ok('OS Keychain Active') : Palette.yellow('AES-256-GCM Encrypted Fallback')}`);
    console.log(`  Connected Providers:   ${Palette.ok(String(doc.providersCount))}`);
    console.log(`  Free Models Pool:      ${Palette.ok(String(doc.freeModelsCount))} available`);
    console.log(`  Git Tooling:           ${doc.gitInstalled ? Palette.ok('Installed') : Palette.yellow('Not found on PATH')}\n`);
  });

// Sessions command
const sessionsCmd = program.command('sessions').description('Manage local coding sessions');
sessionsCmd
  .command('list')
  .description('List past sessions')
  .action(() => {
    const engine = new FlappyEngine();
    const sessions = engine.sessionRepo.listSessions();
    console.log(`Past sessions (${sessions.length}):`);
    for (const s of sessions) {
      console.log(`  ${s.id} - ${s.project_path} (${new Date(s.updated_at).toLocaleString()})`);
    }
  });

sessionsCmd
  .command('delete <id>')
  .description('Delete a session')
  .action((id) => {
    const engine = new FlappyEngine();
    engine.sessionRepo.deleteSession(id);
    console.log(Palette.ok(`✔ Deleted session '${id}'`));
  });

program.parse(process.argv);
