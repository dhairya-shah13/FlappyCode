import { spawn } from 'node:child_process';
import { PermissionEngine } from './permission-engine.js';
import { SecretGuard } from './secret-guard.js';

export interface ShellExecResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  durationMs: number;
  timedOut?: boolean;
}

export class ShellTool {
  constructor(
    private projectRoot: string,
    private permissionEngine: PermissionEngine,
    private secretGuard: SecretGuard,
    private defaultTimeoutMs = 60000,
    private maxOutputBytes = 200000
  ) {}

  public async execute(
    command: string,
    options?: { timeoutMs?: number; isUserApproved?: boolean }
  ): Promise<ShellExecResult> {
    const perm = this.permissionEngine.checkCommand(command);
    if (perm.decision === 'deny') {
      throw new Error(`Command denied by security policy: ${perm.reason}`);
    }
    if (perm.decision === 'ask' && !options?.isUserApproved) {
      throw new Error(`Command requires explicit approval: ${perm.reason || command}`);
    }

    const start = Date.now();
    const timeoutMs = options?.timeoutMs || this.defaultTimeoutMs;

    return new Promise((resolve) => {
      const isWindows = process.platform === 'win32';
      const shellCmd = isWindows ? 'powershell.exe' : '/bin/sh';
      const shellArgs = isWindows ? ['-NoProfile', '-Command', command] : ['-c', command];

      // Scrub secret-like environment variables per RULES.md §32 and GAP-028
      const safeEnv: Record<string, string> = {};
      for (const [k, v] of Object.entries(process.env)) {
        if (
          v !== undefined &&
          !/(?:API_?KEY|TOKEN|SECRET|PASSWORD|PASSWD|AUTH|CREDENTIAL|PRIVATE_?KEY)/i.test(k)
        ) {
          safeEnv[k] = v;
        }
      }
      safeEnv.PAGER = 'cat';

      const child = spawn(shellCmd, shellArgs, {
        cwd: this.projectRoot,
        env: safeEnv,
      });

      let stdout = '';
      let stderr = '';
      let timedOut = false;

      const timer = setTimeout(() => {
        timedOut = true;
        child.kill('SIGKILL');
      }, timeoutMs);

      child.stdout.on('data', (data) => {
        if (stdout.length < this.maxOutputBytes) {
          stdout += data.toString();
        }
      });

      child.stderr.on('data', (data) => {
        if (stderr.length < this.maxOutputBytes) {
          stderr += data.toString();
        }
      });

      child.on('close', (code) => {
        clearTimeout(timer);
        const durationMs = Date.now() - start;
        const cleanStdout = this.secretGuard.redact(stdout);
        const cleanStderr = this.secretGuard.redact(stderr);

        resolve({
          stdout: cleanStdout,
          stderr: cleanStderr,
          exitCode: code ?? (timedOut ? 124 : 1),
          durationMs,
          timedOut,
        });
      });

      child.on('error', (err) => {
        clearTimeout(timer);
        resolve({
          stdout: '',
          stderr: err.message,
          exitCode: 1,
          durationMs: Date.now() - start,
        });
      });
    });
  }
}
