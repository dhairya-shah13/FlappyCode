import { EventBus } from '@flappycode/protocol';
import { loadRules } from '@flappycode/core';
import { renderApp, replay } from '@flappycode/tui';

export const CLI_VERSION = '0.0.0-dev';

export interface CliOptions {
  command?: string;
  args: string[];
  flags: Record<string, string | boolean>;
}

export function parseArgs(rawArgs: string[]): CliOptions {
  const flags: Record<string, string | boolean> = {};
  const args: string[] = [];

  for (let i = 0; i < rawArgs.length; i++) {
    const arg = rawArgs[i];
    if (arg === '--version' || arg === '-v') {
      flags.version = true;
    } else if (arg === '--help' || arg === '-h') {
      flags.help = true;
    } else if (arg === '--approve-plan') {
      flags.approvePlan = true;
    } else if (arg === '--json') {
      flags.json = true;
    } else if (arg === '--quiet' || arg === '-q') {
      flags.quiet = true;
    } else if (arg === '--debug') {
      flags.debug = true;
    } else if (arg.startsWith('--model=')) {
      flags.model = arg.slice(8);
    } else if (arg === '--model' && i + 1 < rawArgs.length) {
      flags.model = rawArgs[++i];
    } else if (arg.startsWith('--')) {
      flags[arg.slice(2)] = true;
    } else if (arg.startsWith('-')) {
      flags[arg.slice(1)] = true;
    } else {
      args.push(arg);
    }
  }

  const command = args[0];
  const commandArgs = args.slice(1);

  return {
    command,
    args: commandArgs,
    flags,
  };
}

export function printHelp(): void {
  console.log(`
\x1b[33mFLAPPY\x1b[36mCODE\x1b[0m — Multi-Provider • Multi-Agent • Free Models • One Assistant
Version: ${CLI_VERSION}

\x1b[1mUSAGE\x1b[0m
  $ flappycode [command] [options]

\x1b[1mCOMMANDS\x1b[0m
  (default)            Launch the interactive terminal UI (TUI)
  run <prompt>         Execute a coding task in non-interactive / headless mode
  replay <fixture>     Replay an event stream JSONL fixture in the TUI
  rules                Inspect active rules and category detections for current directory

\x1b[1mOPTIONS\x1b[0m
  -v, --version        Show flappycode version
  -h, --help           Show this help message
  --approve-plan       Pre-approve implementation plan in headless mode (required for run)
  --model <id>         Select specific model (default: flappyauto)
  --json               Output newline-delimited JSON events instead of human logs
  -q, --quiet          Suppress non-essential progress logs
  --debug              Enable detailed diagnostic stack traces and file logging
  --no-color           Disable ANSI terminal styling

\x1b[1mDOCUMENTATION\x1b[0m
  https://github.com/dhairya-shah13/FlappyCode
`);
}

export async function main(rawArgs: string[] = process.argv.slice(2)): Promise<number> {
  const parsed = parseArgs(rawArgs);

  if (parsed.flags.version) {
    console.log(`flappycode ${CLI_VERSION}`);
    return 0;
  }

  if (parsed.flags.help) {
    printHelp();
    return 0;
  }

  // Handle 'rules' command: diagnostics for loaded rules
  if (parsed.command === 'rules') {
    const rules = loadRules({ projectRoot: process.cwd() });
    console.log(`Active categories: ${rules.activeCategories.join(', ') || 'none'}`);
    console.log(`Loaded rules: ${rules.rules.length}`);
    if (rules.hasErrors()) {
      console.error(`Conflicts detected: ${rules.conflicts.length}`);
      for (const c of rules.conflicts) {
        console.error(` - [${c.ruleId}] (${c.reason}): ${c.message}`);
      }
      return 1;
    }
    return 0;
  }

  // Handle 'replay' command
  if (parsed.command === 'replay') {
    const fixturePath = parsed.args[0];
    if (!fixturePath) {
      console.error('Error: replay command requires a fixture path.');
      console.error('Usage: flappycode replay <path/to/fixture.jsonl>');
      return 2;
    }

    const bus = new EventBus();
    const app = renderApp({ bus, isTTY: process.stdin.isTTY });
    await replay(bus, fixturePath, { speed: 1 });
    await app.waitUntilExit();
    return 0;
  }

  // Handle 'run' command (headless mode per SRS FR-RUL-009 / CLIDesign §6)
  if (parsed.command === 'run') {
    const prompt = parsed.args.join(' ');
    if (!prompt) {
      console.error('Error: run command requires a prompt.');
      console.error('Usage: flappycode run "<prompt>" [--approve-plan]');
      return 2;
    }

    if (!parsed.flags.approvePlan) {
      console.error('✖ Plan approval required: headless mode requires \'--approve-plan\' to execute file edits.');
      console.error('To proceed, re-run with: flappycode run "<prompt>" --approve-plan');
      return 3;
    }

    if (!parsed.flags.quiet) {
      console.error(`[flappycode] Headless task queued: "${prompt}"`);
      console.error('[flappycode] Plan pre-approved via --approve-plan');
    }

    // In week 1, headless execution loop foundation
    console.log(JSON.stringify({ status: 'queued', prompt, version: CLI_VERSION }));
    return 0;
  }

  // Unknown command
  if (parsed.command) {
    console.error(`Unknown command: ${parsed.command}`);
    printHelp();
    return 2;
  }

  // Default: Interactive TUI
  if (!process.stdin.isTTY && process.env.NODE_ENV !== 'test') {
    console.error('FlappyCode interactive TUI requires a TTY terminal.');
    console.error('For automated/non-interactive workflows, use headless mode: flappycode run "<prompt>"');
    return 2;
  }

  const bus = new EventBus();
  const app = renderApp({ bus, isTTY: process.stdin.isTTY });
  await app.waitUntilExit();
  return 0;
}

// Only invoke if running directly as main module
if (process.argv[1] && (process.argv[1].endsWith('cli.js') || process.argv[1].endsWith('cli.ts'))) {
  main()
    .then((code) => {
      process.exit(code);
    })
    .catch((err: unknown) => {
      console.error(err instanceof Error ? err.message : String(err));
      process.exit(1);
    });
}
