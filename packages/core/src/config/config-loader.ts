import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { FlappyConfig, FlappyConfigSchema } from '@flappycode/protocol';

export interface ConfigSources {
  user?: string;
  project?: string;
  cli?: Record<string, any>;
}

export interface LoadedConfig {
  config: FlappyConfig;
  sources: ConfigSources;
}

/** User-level config path: Windows %APPDATA%\flappycode\config.json, else XDG/~/.config. */
export function getUserConfigPath(): string {
  if (process.platform === 'win32') {
    const base = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
    return path.join(base, 'flappycode', 'config.json');
  }
  if (process.platform === 'darwin') {
    return path.join(os.homedir(), 'Library', 'Application Support', 'flappycode', 'config.json');
  }
  const base = process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config');
  return path.join(base, 'flappycode', 'config.json');
}

export function getProjectConfigPath(projectRoot: string): string {
  return path.join(projectRoot, '.flappycode', 'config.json');
}

function readJsonFile(filePath: string): Record<string, any> | null {
  if (!fs.existsSync(filePath)) return null;
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    if (!raw.trim()) return {};
    const parsed = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      throw new Error(
        `Configuration error: ${filePath} must contain a JSON object. Fix the file or run 'flappycode config path' to locate it.`
      );
    }
    return parsed;
  } catch (err: any) {
    if (err instanceof SyntaxError) {
      throw new Error(
        `Configuration error: ${filePath} is not valid JSON (${err.message}). Fix the file and retry.`
      );
    }
    throw err;
  }
}

/** Deep-merge b into a (arrays replaced, objects merged). */
export function deepMerge<T extends Record<string, any>>(a: T, b: Record<string, any> | null): T {
  if (!b) return a;
  const out: Record<string, any> = { ...a };
  for (const [key, value] of Object.entries(b)) {
    if (value === undefined) continue;
    const existing = out[key];
    if (
      value !== null &&
      typeof value === 'object' &&
      !Array.isArray(value) &&
      existing !== null &&
      typeof existing === 'object' &&
      !Array.isArray(existing)
    ) {
      out[key] = deepMerge(existing, value);
    } else {
      out[key] = value;
    }
  }
  return out as T;
}

/**
 * Load configuration with the documented precedence:
 * CLI flags > project config > user config > schema defaults.
 * The result is always schema-validated (fail clearly on invalid values).
 */
export function loadConfig(opts: {
  projectRoot: string;
  cliOverrides?: Record<string, any>;
  userPath?: string;
  projectPath?: string;
}): LoadedConfig {
  const userPath = opts.userPath ?? getUserConfigPath();
  const projectPath = opts.projectPath ?? getProjectConfigPath(opts.projectRoot);

  const userRaw = readJsonFile(userPath);
  const projectRaw = readJsonFile(projectPath);

  let merged: Record<string, any> = {};
  merged = deepMerge(merged, userRaw);
  merged = deepMerge(merged, projectRaw);
  merged = deepMerge(merged, opts.cliOverrides ?? null);

  const parsed = FlappyConfigSchema.safeParse(merged);
  if (!parsed.success) {
    const details = parsed.error.issues
      .map((i) => `  - ${i.path.join('.') || '(root)'}: ${i.message}`)
      .join('\n');
    throw new Error(
      `Configuration validation failed:\n${details}\nFix ${projectPath} (project) or ${userPath} (user) and retry.`
    );
  }

  return {
    config: parsed.data,
    sources: {
      user: fs.existsSync(userPath) ? userPath : undefined,
      project: fs.existsSync(projectPath) ? projectPath : undefined,
      cli: opts.cliOverrides && Object.keys(opts.cliOverrides).length > 0 ? opts.cliOverrides : undefined,
    },
  };
}

/** Resolve a `env:NAME` reference (returns undefined when unset). */
export function resolveEnvRef(value: string | undefined): string | undefined {
  if (value && value.startsWith('env:')) {
    return process.env[value.slice(4)];
  }
  return value;
}

/** Get a dotted-path value from the config (e.g. `model_policy.revalidate_every_hours`). */
export function getConfigValue(config: FlappyConfig, dottedKey: string): any {
  const parts = dottedKey.split('.').filter(Boolean);
  if (parts.length === 0) return config;
  let current: any = config;
  for (const part of parts) {
    if (current === undefined || current === null || typeof current !== 'object') {
      throw new Error(
        `Unknown configuration key '${dottedKey}'. Run 'flappycode config path' to view the config file, or check docs/SRS.md §6.2 for valid keys.`
      );
    }
    current = current[part];
  }
  return current;
}

/** Immutably set a dotted-path value, returning the new config (schema-validated). */
export function setConfigValue(config: FlappyConfig, dottedKey: string, value: any): FlappyConfig {
  const parts = dottedKey.split('.').filter(Boolean);
  if (parts.length === 0) {
    throw new Error(`Invalid configuration key '${dottedKey}'.`);
  }
  const clone: any = structuredClone(config);
  let current = clone;
  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i];
    if (current[part] === undefined || current[part] === null || typeof current[part] !== 'object') {
      throw new Error(
        `Unknown configuration key '${dottedKey}' (no parent object at '${parts.slice(0, i + 1).join('.')}').`
      );
    }
    current = current[part];
  }
  current[parts[parts.length - 1]] = value;

  const parsed = FlappyConfigSchema.safeParse(clone);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    throw new Error(
      `Invalid value for '${dottedKey}': ${first.message}. Expected type per config schema (docs/SRS.md §6.2).`
    );
  }
  return parsed.data;
}

/** Persist config JSON to disk (creating directories as needed). */
export function writeConfigFile(filePath: string, config: FlappyConfig | Record<string, any>): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(config, null, 2) + '\n', 'utf8');
}

/** Recursively mask API keys, tokens, and secrets for safe display. */
export function maskSecrets(obj: any): any {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj === 'string') return obj;
  if (Array.isArray(obj)) return obj.map(maskSecrets);
  if (typeof obj === 'object') {
    const masked: Record<string, any> = {};
    for (const [k, v] of Object.entries(obj)) {
      if (/key|secret|token|password|auth_ref/i.test(k) && typeof v === 'string' && v.length > 0) {
        masked[k] = v.startsWith('env:') ? v : `${v.slice(0, 3)}***${v.length > 6 ? v.slice(-3) : ''}`;
      } else {
        masked[k] = maskSecrets(v);
      }
    }
    return masked;
  }
  return obj;
}

