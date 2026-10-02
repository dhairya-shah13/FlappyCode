#!/usr/bin/env node

// Suppress Node.js experimental warnings (e.g. SQLite DatabaseSync in Node 24)
const originalEmitWarning = process.emitWarning;
process.emitWarning = (warning: any, ...args: any[]) => {
  if (typeof warning === 'string' && warning.includes('SQLite is an experimental feature')) return;
  if (warning && typeof warning === 'object' && warning.message?.includes('SQLite is an experimental feature')) return;
  return (originalEmitWarning as any).call(process, warning, ...args);
};

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { Command } from 'commander';
import readline from 'node:readline';
import {
  FlappyEngine,
  getUserConfigPath,
  getProjectConfigPath,
  getConfigValue,
  setConfigValue,
  writeConfigFile,
  maskSecrets,
  FlappyError,
  ErrorCodes,
  formatErrorForCli,
  formatErrorForJson,
  Logger,
} from '@flappycode/core';
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
  TaskGraphScreen,
  QuestionPromptScreen,
} from '@flappycode/tui';

export const ExitCodes = {
  SUCCESS: 0,
  TASK_FAILED: 1,
  USAGE_ERROR: 2,
  APPROVAL_REQUIRED: 3,
  POOL_EXHAUSTED: 4,
  NO_PROVIDERS: 5,
  CANCELLED: 130,
} as const;

const program = new Command();

program
  .name('flappycode')
  .description('Multi-provider, multi-agent free model aggregator and coding assistant')
  .version('0.1.0')
  .option('--debug', 'Enable verbose local debug logging to flappycode.log');

program.exitOverride((err) => {
  if (
    err.code === 'commander.unknownOption' ||
    err.code === 'commander.unknownCommand' ||
    err.code === 'commander.missingArgument' ||
    err.code === 'commander.missingMandatoryOptionValue' ||
    err.code === 'commander.optionMissingArgument'
  ) {
    process.exit(ExitCodes.USAGE_ERROR);
  }
  if (err.code === 'commander.helpDisplayed' || err.code === 'commander.version') {
    process.exit(0);
  }
  throw err;
});

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
        if ((key && (key.name === 'return' || key.name === 'enter')) || str === 'y' || str === 'Y') {
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

  /**
   * Interactive provider-add flow (prompts + engine.addProvider), shared by
   * the `/providers add` slash command and pool-exhaustion action (b).
   * Screen management stays with the callers; returns true on success.
   */
  const addProviderFlow = async (): Promise<boolean> => {
    console.log(Palette.bold('\nConnect a Provider to FlappyCode'));
    console.log(Palette.subtle('Supported types: openrouter, groq, ollama, ollama-cloud, google, anthropic, openai-compatible\n'));

    const type = await promptSingleLine('Provider type (e.g. openrouter / ollama / groq / google): ');
    if (!type.trim()) {
      console.log(Palette.yellow('Cancelled.'));
      return false;
    }

    const name = await promptSingleLine(`Display name [default: ${type.trim()}]: `);
    const displayName = name.trim() || type.trim();

    let baseUrl: string | undefined;
    if (type.trim().toLowerCase() === 'ollama') {
      const urlInput = await promptSingleLine('Ollama URL [default: http://localhost:11434]: ');
      baseUrl = urlInput.trim() || 'http://localhost:11434';
    } else if (type.trim().toLowerCase() === 'ollama-cloud') {
      const urlInput = await promptSingleLine('Ollama Cloud URL [default: https://ollama.com]: ');
      baseUrl = urlInput.trim() || undefined;
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
      return true;
    } catch (err: any) {
      console.log(Palette.error(`✖ Failed to connect provider: ${err.message}`));
      return false;
    }
  };

  // ---------------------------------------------------------------------------
  // GAP-002: interactive pool-exhaustion notice (event → UI → command).
  // The TUI only translates: it renders the engine's paused state, collects
  // the user's choice, and calls engine.resolvePoolExhausted. All business
  // logic (grants, refresh, resume) stays in the engine.
  // ---------------------------------------------------------------------------

  type PoolChoice = 'authorize_paid' | 'add_free_provider' | 'keep_paused' | 'cancel';

  const promptPoolChoice = (): Promise<PoolChoice> => {
    return new Promise((resolve) => {
      if (!process.stdin.isTTY) {
        resolve('keep_paused');
        return;
      }
      process.stdin.setRawMode(true);
      process.stdin.resume();
      const onKey = (str: string, key: any) => {
        if (key?.ctrl && (key?.name === 'c' || key?.name === 'd')) {
          process.stdin.off('keypress', onKey);
          process.stdin.setRawMode(false);
          process.exit(0);
        }
        if (str === '1') {
          process.stdin.off('keypress', onKey);
          resolve('authorize_paid');
        } else if (str === '2') {
          process.stdin.off('keypress', onKey);
          resolve('add_free_provider');
        } else if (str === 'c' || str === 'C') {
          process.stdin.off('keypress', onKey);
          resolve('cancel');
        } else if (key?.name === 'escape') {
          process.stdin.off('keypress', onKey);
          resolve('keep_paused');
        }
      };
      process.stdin.on('keypress', onKey);
    });
  };

  /** Final explicit confirmation before any PaidGrant — selecting menu item 1 is NOT enough. */
  const promptPaidConfirm = (targetModelId: string): Promise<boolean> => {
    return new Promise((resolve) => {
      if (!process.stdin.isTTY) {
        resolve(false);
        return;
      }
      process.stdin.setRawMode(true);
      process.stdin.resume();
      const onKey = (str: string, key: any) => {
        if (key?.ctrl && (key?.name === 'c' || key?.name === 'd')) {
          process.stdin.off('keypress', onKey);
          process.stdin.setRawMode(false);
          process.exit(0);
        }
        if (str === 'y' || str === 'Y' || key?.name === 'return' || key?.name === 'enter') {
          process.stdin.off('keypress', onKey);
          resolve(true);
        } else if (str === 'n' || str === 'N' || str === 'q' || str === 'Q' || key?.name === 'escape') {
          process.stdin.off('keypress', onKey);
          resolve(false);
        }
      };
      process.stdin.on('keypress', onKey);
    });
  };

  /**
   * Render PoolExhaustedScreen and drive the user's choice back into
   * `engine.resolvePoolExhausted`. Loops until the engine accepts a
   * resolution or the user keeps the run paused.
   */
  const handlePoolExhaustedInteractive = async (
    runId: string
  ): Promise<
    | { status: 'resumed' }
    | { status: 'replanned'; plan: Awaited<ReturnType<typeof engine.submitPrompt>> }
    | { status: 'paused' }
    | { status: 'cancelled' }
  > => {
    for (;;) {
      process.stdout.write('\x1b[2J\x1b[H');
      console.log(
        PoolExhaustedScreen.render(engine.providerRepo.listEnabled().length, getWidth())
      );
      console.log(
        Palette.bold('  [1] Add credit / recharge a paid-capable provider    [2] Connect another free-tier provider    [c] Cancel    [Esc] Keep paused')
      );

      const choice = await promptPoolChoice();
      if (choice === 'cancel') {
        await engine.resolvePoolExhausted(runId, 'cancel');
        console.log(Palette.yellow(`\n✖ Task ${runId} cancelled.`));
        return { status: 'cancelled' };
      }
      if (choice === 'keep_paused') {
        console.log(Palette.yellow(`\n⏸ Task ${runId} remains paused. No resolution was applied.`));
        return { status: 'paused' };
      }

      if (choice === 'authorize_paid') {
        // Show WHICH paid models the grant would target, then require a
        // second, explicit confirmation. The engine issues the PaidGrant.
        const paidModels = engine.getModels().filter((m) => m.tier === 'paid');
        if (paidModels.length === 0) {
          console.log(
            Palette.error('✖ No paid-capable model is registered. Connect a provider with paid models first.')
          );
          await waitForAnyKey();
          continue;
        }
        console.log(Palette.bold('\nPaid models eligible after confirmation:'));
        for (const m of paidModels) {
          console.log(`  - ${m.provider_id}/${m.model_id}`);
        }
        console.log(
          Palette.yellow('\nConfirm: authorize paid usage for this run? [y/N] — no grant exists until you confirm')
        );
        const confirmed = await promptPaidConfirm(paidModels[0].model_id);
        if (!confirmed) {
          console.log(Palette.dim('Cancelled — no PaidGrant was issued.'));
          continue; // back to the two-action screen; run still paused
        }
        try {
          const result = await engine.resolvePoolExhausted(runId, 'authorize_paid', { confirm: true });
          if (result.plan) return { status: 'replanned', plan: result.plan };
          return { status: 'resumed' };
        } catch (err: any) {
          console.log(Palette.error(`✖ ${err.message}`));
          await waitForAnyKey();
          continue;
        }
      }

      // Action (b): connect an additional free-tier provider, then resolve.
      const added = await addProviderFlow();
      if (!added) {
        continue; // back to the two-action screen; run still paused
      }
      try {
        const result = await engine.resolvePoolExhausted(runId, 'add_free_provider');
        if (result.plan) return { status: 'replanned', plan: result.plan };
        return { status: 'resumed' };
      } catch (err: any) {
        // Honest still-exhausted: the run stays paused.
        console.log(Palette.error(`✖ ${err.message}`));
        await waitForAnyKey();
        continue;
      }
    }
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

      // GAP-006: TUI tier-override commands (thin clients over engine methods).
      if (line.startsWith('/models tag ') || line.startsWith('/models untag ')) {
        process.stdout.write('\x1b[2J\x1b[H');
        const parts = line.trim().split(/\s+/); // /models tag <model-id> [--tier <tier>]
        try {
          if (parts[1] === 'untag') {
            const result = engine.deleteModelOverride(parts[2] || '');
            console.log(Palette.ok(`✔ Removed tier override for ${result.provider_id}/${result.model_id}`));
          } else {
            const tierFlag = parts.indexOf('--tier');
            const tier = tierFlag >= 0 ? parts[tierFlag + 1] : undefined;
            if (!tier || !['free', 'paid', 'disabled'].includes(tier)) {
              console.log(Palette.error('✖ Usage: /models tag <model-id> --tier free|paid|disabled'));
            } else {
              const result = engine.setModelOverride(parts[2] || '', tier as 'free' | 'paid' | 'disabled');
              console.log(
                Palette.ok(`✔ Tagged ${result.provider_id}/${result.model_id} as '${result.tier}' (override)`)
              );
            }
          }
        } catch (err: any) {
          console.log(Palette.error(`✖ ${err.message}`));
        }
        console.log(Palette.dim('Hint: /models lists the catalog with override markers.'));
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
        await addProviderFlow();
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

      if (line === '/agents') {
        process.stdout.write('\x1b[2J\x1b[H');
        const agents = engine.listAgents();
        console.log(Palette.bold(`Available Agents (${Object.keys(agents).length}):\n`));
        for (const [name, def] of Object.entries(agents)) {
          console.log(`  ${Palette.cyan(name)}: ${def.system_prompt.slice(0, 80)}...`);
          console.log(`    Default model: ${Palette.dim(def.preferred_model_ref || 'flappyauto')} | Tools: ${Palette.dim(def.allowed_tools.join(', ') || 'none')}\n`);
        }
        await waitForAnyKey();
        process.stdin.setRawMode(true);
        isExecuting = false;
        redraw();
        return;
      }

      if (line === '/sessions') {
        process.stdout.write('\x1b[2J\x1b[H');
        const sessions = engine.listSessions();
        console.log(Palette.bold(`Past Sessions (${sessions.length}):\n`));
        for (const s of sessions) {
          console.log(`  ${Palette.cyan(s.id)} - ${s.project_path} (${new Date(s.updated_at).toLocaleString()})`);
        }
        await waitForAnyKey();
        process.stdin.setRawMode(true);
        isExecuting = false;
        redraw();
        return;
      }

      if (line === '/help') {
        process.stdout.write('\x1b[2J\x1b[H');
        console.log(Palette.bold('FlappyCode Slash Commands:\n'));
        console.log(`  ${Palette.cyan('/models')}                                  Open model catalog`);
        console.log(`  ${Palette.cyan('/models tag <id> --tier <free|paid|disabled>')} Tag tier override`);
        console.log(`  ${Palette.cyan('/models untag <id>')}                          Remove tier override`);
        console.log(`  ${Palette.cyan('/agents')}                                  List available agents`);
        console.log(`  ${Palette.cyan('/providers')}                               List connected providers`);
        console.log(`  ${Palette.cyan('/providers add')}                           Connect a new provider`);
        console.log(`  ${Palette.cyan('/sessions')}                                List past sessions`);
        console.log(`  ${Palette.cyan('/undo')}                                    Undo last file modifications`);
        console.log(`  ${Palette.cyan('/rules')}                                   Display active rules`);
        console.log(`  ${Palette.cyan('/help')}                                    Show this help message`);
        console.log(`  ${Palette.cyan('/exit')}                                    Exit FlappyCode\n`);
        await waitForAnyKey();
        process.stdin.setRawMode(true);
        isExecuting = false;
        redraw();
        return;
      }

      if (line.startsWith('/')) {
        process.stdout.write('\x1b[2J\x1b[H');
        console.log(`Available slash commands: /models, /models tag <id> --tier <free|paid|disabled>, /models untag <id>, /agents, /providers, /providers add, /sessions, /undo, /rules, /help, /exit`);
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
        // GAP-002: capture the run id of a planning-stage pool pause from the
        // engine's approval.requested event (event → UI → command).
        let poolRunId: string | undefined;
        const unsubPool = engine.eventBus.on('approval.requested', (ev) => {
          if (ev.kind === 'pool_exhausted') poolRunId = ev.run_id;
        });

        let plan: Awaited<ReturnType<typeof engine.submitPrompt>> | null = null;
        try {
          plan = await engine.submitPrompt(line);
        } catch (err: any) {
          if (err?.name !== 'PoolExhaustedError' || !poolRunId) throw err;
          const outcome = await handlePoolExhaustedInteractive(poolRunId);
          if (outcome.status === 'cancelled') {
            plan = null;
          } else {
            plan = outcome.status === 'replanned' ? outcome.plan : null;
            if (plan === null) {
              console.log(
                Palette.yellow(`\n⏸ Run ${poolRunId} is paused. Resolve it later to resume — no paid model was used.`)
              );
            }
          }
        } finally {
          unsubPool();
        }

        if (plan === null) {
          await waitForAnyKey();
          process.stdin.setRawMode(true);
          isExecuting = false;
          redraw();
          return;
        }

        process.stdout.write('\x1b[2J\x1b[H');
        console.log(PlanApprovalScreen.render(plan, getWidth()));

        const executeWithProgress = async (runId: string) => {
          console.log(
            '\n' +
              TaskGraphScreen.render({
                goal: plan.goal,
                nodes: plan.graph.nodes,
                plannerModel: plan.planner_model,
                state: 'WORKING',
                width: getWidth(),
              })
          );

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

          engine.setAskUser(async (req) => {
            console.log(
              '\n' +
                QuestionPromptScreen.render({
                  questionId: req.questionId,
                  agent: req.agent,
                  question: req.question,
                  options: req.options,
                  width: getWidth(),
                })
            );
            if (req.options && req.options.length > 0) {
              const ans = await promptSingleLine(Palette.bold('Select option (number or text): '));
              const num = parseInt(ans.trim(), 10);
              if (!isNaN(num) && num >= 1 && num <= req.options.length) {
                return req.options[num - 1];
              }
              return ans.trim() || req.options[0];
            } else {
              const ans = await promptSingleLine(Palette.bold('Answer: '));
              return ans.trim() || 'No answer provided';
            }
          });

          const onDiffApprovalRequired = async (proposal: any): Promise<boolean> => {
            console.log('\n' + DiffReviewScreen.render(proposal.diffs, getWidth()));
            console.log(Palette.bold('Approve diff? [ ↵ / a Apply all ]  [ y Review hunks ]  [ Esc / n Deny ]'));
            return new Promise((resolve) => {
              const onKey = async (_ch: string, key: any) => {
                if (key?.name === 'a' || key?.name === 'return') {
                  process.stdin.removeListener('keypress', onKey);
                  resolve(true);
                } else if (key?.name === 'y') {
                  process.stdin.removeListener('keypress', onKey);
                  let anyHunkApproved = false;
                  for (const d of proposal.diffs) {
                    for (let h = 0; h < d.hunks.length; h++) {
                      console.log(`\nFile: ${d.path}, Hunk ${h + 1}/${d.hunks.length}`);
                      for (const l of d.hunks[h].lines) {
                        console.log(l.startsWith('+') ? Palette.ok(l) : l.startsWith('-') ? Palette.error(l) : Palette.dim(l));
                      }
                      const decision = await promptSingleLine('Apply this hunk? [y/n]: ');
                      if (decision.toLowerCase().startsWith('y')) {
                        anyHunkApproved = true;
                      }
                    }
                  }
                  resolve(anyHunkApproved);
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
            // GAP-002: pause → interactive notice → resolve → resume, all in
            // one loop so the event subscriptions stay alive across resume.
            let done = false;
            while (!done) {
              try {
                await engine.executePlan(runId, onDiffApprovalRequired, onPermissionApprovalRequired);
                console.log(Palette.ok(`\n✔ Task completed successfully!`));
                done = true;
              } catch (err: any) {
                if (err?.name !== 'PoolExhaustedError') throw err;
                const outcome = await handlePoolExhaustedInteractive(runId);
                if (outcome.status === 'resumed') {
                  // resolvePoolExhausted re-ran executePlan to completion.
                  console.log(Palette.ok(`\n✔ Task completed successfully!`));
                  done = true;
                } else if (outcome.status === 'replanned') {
                  // Resolution produced a fresh plan (pause boundary crossed
                  // during planning): run the standard approval flow.
                  process.stdout.write('\x1b[2J\x1b[H');
                  console.log(PlanApprovalScreen.render(outcome.plan, getWidth()));
                  const d = await promptPlanDecision();
                  if (d === 'approve') {
                    engine.approvePlan(outcome.plan.run_id);
                    runId = outcome.plan.run_id;
                  } else {
                    console.log(Palette.yellow('\n✖ Plan rejected. Run cancelled. No files were modified.'));
                    done = true;
                  }
                } else {
                  // keep paused: exit the run cleanly, state persists.
                  console.log(
                    Palette.yellow(`\n⏸ Run ${runId} is paused. Resolve it later to resume — no paid model was used.`)
                  );
                  done = true;
                }
              }
            }
          } finally {
            engine.setAskUser(undefined);
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
  .command('run [prompt]')
  .description('Run a single task non-interactively (headless mode)')
  .option('--model <id>', 'Specific model ID or flappyauto', 'flappyauto')
  .option('--approve-plan', 'Explicitly approve the implementation plan (mandatory for writes)')
  .option('--json', 'Output newline-delimited protocol events')
  .option('--cwd <path>', 'Working directory', process.cwd())
  .option('--debug', 'Enable verbose local debug logging to flappycode.log')
  .action(async (prompt, options) => {
    const isDebug = options?.debug || program.opts().debug || process.env.FLAPPYCODE_DEBUG === '1' || process.argv.includes('--debug');
    const projectRoot = options?.cwd ? path.resolve(options.cwd) : process.cwd();

    let logger: Logger | undefined;
    if (isDebug) {
      logger = new Logger({ level: 'debug' });
      logger.debug('Starting headless run', { prompt, model: options?.model, approvePlan: options?.approvePlan, projectRoot });
    }

    // Missing required argument -> exit code 2 (GAP-024)
    if (!prompt || typeof prompt !== 'string' || !prompt.trim()) {
      if (logger) {
        logger.warn('Usage error: missing required prompt argument');
      }
      const err = new FlappyError({
        code: ErrorCodes.USAGE_MISSING_PROMPT,
        category: 'usage',
        what: "Missing required argument 'prompt'.",
        next: 'Provide a task prompt, e.g. flappycode run "add logging"',
      });
      if (!options?.json) {
        console.error(formatErrorForCli(err));
      } else {
        console.error(JSON.stringify(formatErrorForJson(err)));
      }
      process.exit(ExitCodes.USAGE_ERROR);
    }

    let engine: FlappyEngine;
    try {
      engine = new FlappyEngine({ projectRoot, disableScheduler: true });
    } catch (err: any) {
      if (options.json) {
        console.error(JSON.stringify(formatErrorForJson(err)));
      } else {
        console.error(formatErrorForCli(err));
      }
      process.exit(ExitCodes.TASK_FAILED);
    }

    if (logger && engine.secretGuard) {
      (logger as any).secretGuard = engine.secretGuard;
    }

    if (logger) {
      engine.eventBus.onAny((ev) => {
        logger!.debug(`Event: ${ev.type}`, { event: ev });
      });
    }

    if (options.json) {
      engine.eventBus.onAny((ev) => {
        console.log(JSON.stringify(ev));
      });
    }

    // Cancellation wiring (GAP-024 B: SIGINT results in run.cancelled and exit code 130)
    let isCancelled = false;
    let activeRunId: string | undefined;
    const sigintHandler = () => {
      if (isCancelled) return;
      isCancelled = true;
      if (!options.json) {
        console.error(Palette.yellow('\n✖ Cancellation requested. Aborting in-flight operations...'));
      }
      engine.cancelRun(activeRunId);
      setTimeout(() => {
        process.exit(ExitCodes.CANCELLED);
      }, 500);
    };
    process.once('SIGINT', sigintHandler);

    engine.eventBus.on('run.cancelled', () => {
      process.removeListener('SIGINT', sigintHandler);
      process.exit(ExitCodes.CANCELLED);
    });

    try {
      const providers = engine.providerRepo.listEnabled();
      if (providers.length === 0) {
        const err = new FlappyError({
          code: ErrorCodes.NO_PROVIDERS,
          category: 'provider',
          what: 'No enabled providers configured.',
          next: 'Run "flappycode providers add" to connect a provider.',
        });
        if (options.json) {
          console.log(JSON.stringify({
            type: 'run.failed',
            run_id: 'run_init',
            error: err.what,
            reason: 'no_providers',
            error_details: err.toStructured(),
            timestamp: Date.now(),
          }));
        } else {
          console.error(formatErrorForCli(err));
        }
        process.removeListener('SIGINT', sigintHandler);
        process.exit(ExitCodes.NO_PROVIDERS);
      }

      const plan = await engine.submitPrompt(prompt, { model: options.model });
      activeRunId = plan.run_id;

      // Without --approve-plan, exit code 3 is mandatory per SRS FR-RUL-009 & CLIDesign.md §5.1
      if (!options.approvePlan) {
        process.removeListener('SIGINT', sigintHandler);
        const err = new FlappyError({
          code: ErrorCodes.APPROVAL_REQUIRED,
          category: 'approval_required',
          what: 'Approval required: Headless execution requires explicit --approve-plan flag.',
          why: 'A human approval is required before modifying any project files.',
          next: 'Re-run with --approve-plan to execute the generated plan.',
        });
        engine.failRun(plan.run_id, err.what, 'approval_required', err.toStructured());
        if (!options.json) {
          console.error(formatErrorForCli(err));
        }
        process.exit(ExitCodes.APPROVAL_REQUIRED);
      }

      engine.approvePlan(plan.run_id);
      await engine.executePlan(
        plan.run_id,
        async () => true, // Headless with --approve-plan approves diff review
        async (req) => req.isDestructive ? 'deny' : 'allow',
        { approvalProvenance: 'headless_flag' }
      );

      process.removeListener('SIGINT', sigintHandler);
      if (!options.json) {
        console.log(Palette.ok(`✔ Done: Completed task "${plan.goal}"`));
      }
      process.exit(ExitCodes.SUCCESS);
    } catch (err: any) {
      process.removeListener('SIGINT', sigintHandler);
      if (err?.name === 'RunCancelledError' || isCancelled) {
        process.exit(ExitCodes.CANCELLED);
      }
      const isPoolExhausted =
        err?.name === 'PoolExhaustedError' ||
        err?.code === 'POOL_EXHAUSTED' ||
        err?.message?.includes('pool is exhausted') ||
        err?.message?.includes('pool exhausted');
      if (isPoolExhausted) {
        if (!options.json) {
          const poolErr = new FlappyError({
            code: ErrorCodes.POOL_EXHAUSTED,
            category: 'pool_exhausted',
            what: 'Free model pool exhausted.',
            why: 'All free-tier providers are exhausted or rate-limited.',
            next: 'Connect an additional free provider or authorize paid models.',
          });
          console.error(formatErrorForCli(poolErr));
        }
        process.exit(ExitCodes.POOL_EXHAUSTED);
      }
      // In --json mode the engine already emitted run.failed; keep stdout NDJSON-only.
      if (!options.json) {
        console.error(formatErrorForCli(err));
      }
      process.exit(ExitCodes.TASK_FAILED);
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

providersCmd
  .command('test [id]')
  .description('Test connectivity, authentication, and health of connected providers')
  .option('--json', 'Output results as JSON')
  .action(async (id?: string, options?: { json?: boolean }) => {
    const engine = new FlappyEngine();
    try {
      if (!options?.json) {
        console.log(Palette.bold(`\nTesting provider diagnostics${id ? ` for '${id}'` : ''}...`));
      }
      const results = await engine.testProviders(id);
      if (options?.json) {
        console.log(JSON.stringify(results, null, 2));
        return;
      }

      console.log(`\nProvider Test Results (${results.length}):`);
      for (const r of results) {
        const statusTag =
          r.status === 'healthy'
            ? Palette.ok('healthy')
            : r.status === 'rate_limited'
              ? Palette.yellow('rate-limited')
              : r.status === 'auth_failed'
                ? Palette.error('auth-failed')
                : r.status === 'unreachable'
                  ? Palette.error('unreachable')
                  : Palette.dim(r.status);
        const latency = r.latency_ms > 0 ? ` (${r.latency_ms}ms)` : '';
        const errorMsg = r.error ? ` — ${Palette.error(r.error)}` : '';
        console.log(`  ${r.provider_id} [${statusTag}${latency}]${errorMsg}`);
      }
      console.log();
    } catch (err: any) {
      if (options?.json) {
        console.log(JSON.stringify({ error: err.message }));
      } else {
        console.error(Palette.error(`✖ Provider test failed: ${err.message}`));
      }
      process.exit(1);
    }
  });

// Models command
const modelsCmd = program.command('models').description('List available models in the unified catalog');

modelsCmd
  .option('--free', 'Show only free / rate-limited-free models')
  .option('--provider <id>', 'Filter by provider')
  .option('--tier <tier>', 'Filter by tier (free, rate_limited_free, paid, disabled)')
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
      const tierTag =
        m.tier === 'free'
          ? Palette.ok('free')
          : m.tier === 'rate_limited_free'
            ? Palette.subtle('rate-limited-free')
            : m.tier === 'disabled'
              ? Palette.dim('disabled')
              : m.tier === 'unavailable'
                ? Palette.dim('unavailable')
                : Palette.orange('paid');
      // GAP-006: surface the effective tier source so overrides are visible.
      const source = m.tier_source === 'override' ? Palette.cyan(' override') : '';
      console.log(
        `  ${m.provider_id}/${m.model_id} [${tierTag}${source}] (${(m.context_length / 1024).toFixed(0)}k ctx)`
      );
    }
  });

// GAP-006 (FR-MOD-005): user-facing tier override commands.
modelsCmd
  .command('tag <model-id>')
  .description("Force a model's tier (e.g. flappycode models tag openrouter/qwen3-coder:free --tier free)")
  .requiredOption('--tier <tier>', 'Tier: free | paid | disabled')
  .option('--json', 'Output as JSON')
  .action((modelId: string, options: { tier: string; json?: boolean }) => {
    const engine = new FlappyEngine();
    const validTiers = ['free', 'paid', 'disabled'];
    if (!validTiers.includes(options.tier)) {
      const msg = `Invalid tier '${options.tier}'. Valid tiers: ${validTiers.join(', ')}.`;
      if (options.json) console.log(JSON.stringify({ success: false, error: msg }));
      else console.error(Palette.error(`✖ ${msg}`));
      process.exit(2);
    }
    try {
      const result = engine.setModelOverride(modelId, options.tier as 'free' | 'paid' | 'disabled');
      if (options.json) {
        console.log(JSON.stringify({ success: true, ...result, tier_source: 'override' }, null, 2));
      } else {
        console.log(
          Palette.ok(`✔ Tagged ${result.provider_id}/${result.model_id} as '${result.tier}' (override persists across providers refresh)`)
        );
        if (result.tier === 'paid') {
          console.log(Palette.dim('  Note: paid models still require an explicit PaidGrant before any call is made.'));
        }
      }
    } catch (err: any) {
      if (options.json) console.log(JSON.stringify({ success: false, error: err.message }));
      else console.error(Palette.error(`✖ ${err.message}`));
      process.exit(2);
    }
  });

modelsCmd
  .command('untag <model-id>')
  .description('Remove a tier override and restore inferred classification')
  .option('--json', 'Output as JSON')
  .action((modelId: string, options: { json?: boolean }) => {
    const engine = new FlappyEngine();
    try {
      const result = engine.deleteModelOverride(modelId);
      if (options.json) {
        console.log(JSON.stringify({ success: true, ...result }, null, 2));
      } else {
        console.log(Palette.ok(`✔ Removed tier override for ${result.provider_id}/${result.model_id}`));
      }
    } catch (err: any) {
      if (options.json) console.log(JSON.stringify({ success: false, error: err.message }));
      else console.error(Palette.error(`✖ ${err.message}`));
      process.exit(2);
    }
  });

// Doctor command
program
  .command('doctor')
  .description('Diagnose environment, keychain, database, and providers')
  .option('--json', 'Output diagnostics as JSON')
  .action(async (options?: { json?: boolean }) => {
    const engine = new FlappyEngine();
    const doc = await engine.doctor();
    if (options?.json) {
      console.log(JSON.stringify(doc, null, 2));
      return;
    }
    console.log(Palette.bold('\nFlappyCode Diagnostics:'));
    console.log(`  Node.js Version:       ${Palette.ok(doc.nodeVersion)} (≥ 20 required)`);
    console.log(`  Database Storage:      ${doc.dbOpen ? Palette.ok('Connected (WAL mode)') : Palette.error('Closed')}`);
    console.log(`  Database Integrity:    ${doc.dbIntegrity ? Palette.ok('Passed') : Palette.error('Corruption detected')}`);
    console.log(`  Secret Store:          ${doc.keychainActive ? Palette.ok('OS Keychain Active') : Palette.yellow('AES-256-GCM Encrypted Fallback')}`);
    console.log(`  Connected Providers:   ${Palette.ok(String(doc.providersCount))} (${doc.providersReachable} reachable)`);
    if (doc.providerHealth && doc.providerHealth.length > 0) {
      for (const p of doc.providerHealth) {
        const status = p.status === 'healthy' ? Palette.ok('healthy') : Palette.error(p.status);
        const err = p.error ? ` - ${p.error}` : '';
        console.log(`    - ${p.id}: [${status}]${err}`);
      }
    }
    console.log(`  Free Models Pool:      ${Palette.ok(String(doc.freeModelsCount))} available`);
    console.log(`  Git Tooling:           ${doc.gitInstalled ? Palette.ok('Installed') : Palette.yellow('Not found on PATH')}`);
    console.log(`  Config Files:          User: ${doc.configUser ? 'Found' : 'Default'} | Project: ${doc.configProject ? 'Found' : 'None'}`);
    console.log(`  Agents Loaded:         ${Palette.ok(String(doc.agentsLoaded))} (${doc.agentErrors} invalid)`);
    if (doc.remediationHints && doc.remediationHints.length > 0) {
      console.log(Palette.yellow('\nRemediation Hints:'));
      for (const hint of doc.remediationHints) {
        console.log(`  • ${hint}`);
      }
    }
    console.log();
  });

// Config command (GAP-033)
const configCmd = program.command('config').description('Inspect and modify FlappyCode configuration');

configCmd
  .command('path')
  .description('Print paths to user and project configuration files')
  .option('--json', 'Output paths as JSON')
  .action((options?: { json?: boolean }) => {
    const userPath = getUserConfigPath();
    const projectPath = getProjectConfigPath(process.cwd());
    if (options?.json) {
      console.log(JSON.stringify({ user: userPath, project: projectPath }, null, 2));
      return;
    }
    console.log(Palette.bold('\nFlappyCode Configuration Paths:'));
    console.log(`  User:    ${userPath}`);
    console.log(`  Project: ${projectPath}\n`);
  });

configCmd
  .command('get [key]')
  .description('View configuration (sensitive keys are masked)')
  .option('--json', 'Output as JSON')
  .action((key?: string, options?: { json?: boolean }) => {
    try {
      const engine = new FlappyEngine();
      if (key) {
        const val = getConfigValue(engine.config, key);
        const masked = maskSecrets(val);
        if (options?.json || typeof masked === 'object') {
          console.log(JSON.stringify(masked, null, 2));
        } else {
          console.log(String(masked));
        }
      } else {
        const masked = maskSecrets(engine.config);
        console.log(JSON.stringify(masked, null, 2));
      }
    } catch (err: any) {
      console.error(Palette.error(`✖ ${err.message}`));
      process.exit(1);
    }
  });

configCmd
  .command('set <key> <value>')
  .description('Set a configuration setting (e.g. flappycode config set model_policy.allow_paid_models true)')
  .option('--global', 'Write to user configuration instead of project configuration')
  .option('--json', 'Output updated config as JSON')
  .action((key: string, rawVal: string, options?: { global?: boolean; json?: boolean }) => {
    try {
      let parsedVal: any = rawVal;
      if (rawVal === 'true') parsedVal = true;
      else if (rawVal === 'false') parsedVal = false;
      else if (!isNaN(Number(rawVal)) && rawVal.trim() !== '') parsedVal = Number(rawVal);
      else {
        try {
          parsedVal = JSON.parse(rawVal);
        } catch {
          parsedVal = rawVal;
        }
      }

      const userPath = getUserConfigPath();
      const projectPath = getProjectConfigPath(process.cwd());
      const targetPath = options?.global ? userPath : projectPath;

      const engine = new FlappyEngine();
      const updated = setConfigValue(engine.config, key, parsedVal);
      writeConfigFile(targetPath, updated);

      if (options?.json) {
        console.log(JSON.stringify({ success: true, key, value: parsedVal, file: targetPath }, null, 2));
      } else {
        console.log(Palette.ok(`✔ Set '${key}' = ${JSON.stringify(parsedVal)} in ${targetPath}`));
      }
    } catch (err: any) {
      console.error(Palette.error(`✖ ${err.message}`));
      process.exit(1);
    }
  });

configCmd
  .command('edit')
  .description('Open the active configuration file in your default editor')
  .option('--global', 'Edit user configuration instead of project configuration')
  .action((options?: { global?: boolean }) => {
    const userPath = getUserConfigPath();
    const projectPath = getProjectConfigPath(process.cwd());
    const targetPath = options?.global ? userPath : projectPath;

    if (!fs.existsSync(targetPath)) {
      const engine = new FlappyEngine();
      writeConfigFile(targetPath, engine.config);
    }

    const editor = process.env.VISUAL || process.env.EDITOR || (process.platform === 'win32' ? 'notepad' : 'nano');
    console.log(Palette.cyan(`Opening configuration in ${editor}: ${targetPath}`));
    try {
      spawnSync(editor, [targetPath], { stdio: 'inherit' });
    } catch (err: any) {
      console.error(Palette.error(`✖ Could not launch editor '${editor}': ${err.message}`));
      console.log(`Config path: ${targetPath}`);
      process.exit(1);
    }
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
  .command('resume <id>')
  .description('Resume a past session')
  .action((id) => {
    const engine = new FlappyEngine();
    const res = engine.resumeSession(id);
    if (!res) {
      console.error(Palette.error(`✖ Session '${id}' not found`));
      process.exit(1);
    }
    console.log(Palette.ok(`✔ Loaded session '${id}' (${res.messages.length} message(s), project: ${res.session.project_path})`));
  });

sessionsCmd
  .command('delete <id>')
  .description('Delete a session')
  .action((id) => {
    const engine = new FlappyEngine();
    engine.sessionRepo.deleteSession(id);
    console.log(Palette.ok(`✔ Deleted session '${id}'`));
  });

// Agents command
const agentsCmd = program.command('agents').description('Manage agent definitions');
agentsCmd
  .command('list')
  .description('List available agents (built-in and custom)')
  .action(() => {
    const engine = new FlappyEngine();
    const agents = engine.listAgents();
    console.log(Palette.bold(`Available Agents (${Object.keys(agents).length}):\n`));
    for (const [name, def] of Object.entries(agents)) {
      console.log(`  ${Palette.cyan(name)}: ${def.system_prompt.slice(0, 80)}...`);
      console.log(`    Default model: ${Palette.dim(def.preferred_model_ref || 'flappyauto')} | Tools: ${Palette.dim(def.allowed_tools.join(', ') || 'none')}\n`);
    }
  });

// Guard against unknown subcommands silently launching the TUI
const knownCommands = ['run', 'serve', 'providers', 'models', 'doctor', 'sessions', 'agents', 'config'];
const firstArg = process.argv[2];
if (firstArg && !firstArg.startsWith('-') && !knownCommands.includes(firstArg)) {
  console.error(Palette.error(`✖ Unknown command: '${firstArg}'. Run 'flappycode --help' for usage.`));
  process.exit(ExitCodes.USAGE_ERROR);
}

program.parse(process.argv);

