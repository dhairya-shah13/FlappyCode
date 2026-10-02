import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { SecretGuard } from '../tools/secret-guard.js';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

export interface LoggerOptions {
  /** Override log directory (tests inject isolated dirs via FLAPPYCODE_LOG_DIR). */
  logDir?: string;
  /** Maximum log file size in bytes before rotation (default: 5 MB). */
  maxSizeBytes?: number;
  /** Maximum number of rotated backup files to keep (default: 3). */
  maxFiles?: number;
  /** Minimum log level to write (default: 'info'). */
  level?: LogLevel;
  /** SecretGuard instance for final-boundary redaction of all log content. */
  secretGuard?: SecretGuard;
}

/**
 * Platform-aware log directory resolution.
 *
 * Priority:
 * 1. FLAPPYCODE_LOG_DIR environment variable (tests, user override)
 * 2. Windows: %LOCALAPPDATA%\flappycode\logs
 * 3. macOS:   ~/Library/Logs/flappycode
 * 4. Linux:   $XDG_STATE_HOME/flappycode/logs (fallback ~/.local/state/flappycode/logs)
 */
export function getLogDir(): string {
  if (process.env.FLAPPYCODE_LOG_DIR) {
    return process.env.FLAPPYCODE_LOG_DIR;
  }
  if (process.platform === 'win32') {
    const base = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
    return path.join(base, 'flappycode', 'logs');
  }
  if (process.platform === 'darwin') {
    return path.join(os.homedir(), 'Library', 'Logs', 'flappycode');
  }
  // Linux / other POSIX
  const base = process.env.XDG_STATE_HOME || path.join(os.homedir(), '.local', 'state');
  return path.join(base, 'flappycode', 'logs');
}

const LOG_FILENAME = 'flappycode.log';
const DEFAULT_MAX_SIZE = 5 * 1024 * 1024; // 5 MB
const DEFAULT_MAX_FILES = 3;

/**
 * Local structured file logger with size-based rotation and secret redaction.
 *
 * - Writes newline-delimited JSON records to `flappycode.log`.
 * - Rotates when the active file exceeds `maxSizeBytes`.
 * - Passes all log content through SecretGuard before writing.
 * - Never writes to stdout or stderr — debug output is local-file-only.
 */
export class Logger {
  private readonly logDir: string;
  private readonly logPath: string;
  private readonly maxSizeBytes: number;
  private readonly maxFiles: number;
  private level: LogLevel;
  private secretGuard: SecretGuard | null;
  private initialized = false;

  constructor(options: LoggerOptions = {}) {
    this.logDir = options.logDir || getLogDir();
    this.logPath = path.join(this.logDir, LOG_FILENAME);
    this.maxSizeBytes = options.maxSizeBytes ?? DEFAULT_MAX_SIZE;
    this.maxFiles = options.maxFiles ?? DEFAULT_MAX_FILES;
    this.level = options.level ?? 'info';
    this.secretGuard = options.secretGuard ?? null;
  }

  public setLevel(level: LogLevel): void {
    this.level = level;
  }

  public getLogPath(): string {
    return this.logPath;
  }

  public getLogDir(): string {
    return this.logDir;
  }

  // -- Public log methods --

  public debug(message: string, context?: Record<string, any>): void {
    this.writeRecord('debug', message, context);
  }

  public info(message: string, context?: Record<string, any>): void {
    this.writeRecord('info', message, context);
  }

  public warn(message: string, context?: Record<string, any>): void {
    this.writeRecord('warn', message, context);
  }

  public error(message: string, context?: Record<string, any>): void {
    this.writeRecord('error', message, context);
  }

  // -- Internals --

  private ensureDir(): void {
    if (this.initialized) return;
    try {
      fs.mkdirSync(this.logDir, { recursive: true });
    } catch {
      // If we can't create the log directory, silently degrade.
    }
    // Handle an already-oversized log on startup.
    this.rotateIfNeeded();
    this.initialized = true;
  }

  private writeRecord(
    level: LogLevel,
    message: string,
    context?: Record<string, any>,
  ): void {
    if (LEVEL_PRIORITY[level] < LEVEL_PRIORITY[this.level]) return;
    this.ensureDir();

    const record: Record<string, any> = {
      timestamp: new Date().toISOString(),
      level,
      message: this.redact(message),
    };
    if (context) {
      record.context = this.redactContext(context);
    }

    this.rotateIfNeeded();

    try {
      fs.appendFileSync(this.logPath, JSON.stringify(record) + '\n', 'utf8');
    } catch {
      // File logger must never crash the process.
    }
  }

  private rotateIfNeeded(): void {
    let size: number;
    try {
      const stat = fs.statSync(this.logPath);
      size = stat.size;
    } catch {
      return; // File doesn't exist yet or can't be stat'd.
    }

    if (size < this.maxSizeBytes) return;

    // Delete oldest backup if it exceeds maxFiles
    const oldest = `${this.logPath}.${this.maxFiles}`;
    try {
      if (fs.existsSync(oldest)) {
        fs.unlinkSync(oldest);
      }
    } catch { /* ignore */ }

    // Shift existing backups: .2 -> .3, .1 -> .2
    for (let i = this.maxFiles - 1; i >= 1; i--) {
      const src = `${this.logPath}.${i}`;
      const dst = `${this.logPath}.${i + 1}`;
      try {
        if (fs.existsSync(src)) {
          fs.renameSync(src, dst);
        }
      } catch {
        // Best effort rotation — never crash.
      }
    }

    // Rename active file to .1
    try {
      if (fs.existsSync(this.logPath)) {
        fs.renameSync(this.logPath, `${this.logPath}.1`);
      }
    } catch {
      // If rename fails, truncate the active file instead.
      try { fs.writeFileSync(this.logPath, '', 'utf8'); } catch { /* ignore */ }
    }
  }

  private redact(text: string): string {
    if (!this.secretGuard) return text;
    return this.secretGuard.redact(text);
  }

  private redactContext(context: Record<string, any>): Record<string, any> {
    if (!this.secretGuard) return context;
    // Deep redact by serializing, redacting, and parsing back.
    try {
      const serialized = JSON.stringify(context);
      const redacted = this.secretGuard.redact(serialized);
      return JSON.parse(redacted);
    } catch {
      return context;
    }
  }
}
