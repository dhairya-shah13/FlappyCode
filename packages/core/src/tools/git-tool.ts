import { ShellTool } from './shell-tool.js';
import { SecretGuard } from './secret-guard.js';

export interface GitStructuredStatus {
  branch: string;
  staged: string[];
  unstaged: string[];
  untracked: string[];
  ahead: number;
  behind: number;
  clean: boolean;
  raw: string;
}

export interface GitStructuredDiff {
  files: Array<{
    path: string;
    insertions: number;
    deletions: number;
    patch: string;
  }>;
  raw: string;
}

export interface GitOperationOptions {
  isUserApproved?: boolean;
  confirmed?: boolean;
}

export class GitTool {
  private protectedBranches: Set<string>;

  constructor(
    private shell: ShellTool,
    private secretGuard: SecretGuard,
    protectedBranches: string[] = ['main', 'master']
  ) {
    this.protectedBranches = new Set(protectedBranches);
  }

  public setProtectedBranches(branches: string[]): void {
    this.protectedBranches = new Set(branches);
  }

  public isProtectedBranch(branch: string): boolean {
    return this.protectedBranches.has(branch.trim());
  }

  /**
   * Run raw status string.
   */
  public async status(): Promise<string> {
    const res = await this.shell.execute('git status --short');
    return res.stdout.trim();
  }

  /**
   * Return structured Git status (branch, staged, unstaged, untracked, ahead/behind).
   */
  public async statusStructured(): Promise<GitStructuredStatus> {
    const branchRes = await this.shell.execute('git branch --show-current');
    let currentBranch = branchRes.stdout.trim();
    if (!currentBranch) {
      const headRes = await this.shell.execute('git rev-parse --short HEAD');
      currentBranch = headRes.stdout.trim() || 'HEAD (detached)';
    }

    const statusRes = await this.shell.execute('git status --porcelain=v1 -b');
    const raw = statusRes.stdout;
    const lines = raw.split('\n');

    const staged: string[] = [];
    const unstaged: string[] = [];
    const untracked: string[] = [];
    let ahead = 0;
    let behind = 0;

    for (const line of lines) {
      if (!line) continue;
      if (line.startsWith('##')) {
        const aheadMatch = line.match(/ahead\s+(\d+)/);
        if (aheadMatch) ahead = parseInt(aheadMatch[1], 10);
        const behindMatch = line.match(/behind\s+(\d+)/);
        if (behindMatch) behind = parseInt(behindMatch[1], 10);
        continue;
      }

      const x = line[0];
      const y = line[1];
      const file = line.slice(3).trim();

      if (x === '?' && y === '?') {
        untracked.push(file);
      } else {
        if (x !== ' ' && x !== '?') {
          staged.push(file);
        }
        if (y !== ' ' && y !== '?') {
          unstaged.push(file);
        }
      }
    }

    return {
      branch: currentBranch,
      staged,
      unstaged,
      untracked,
      ahead,
      behind,
      clean: staged.length === 0 && unstaged.length === 0 && untracked.length === 0,
      raw,
    };
  }

  /**
   * Raw Git diff.
   */
  public async diff(staged = false): Promise<string> {
    const cmd = staged ? 'git diff --cached' : 'git diff';
    const res = await this.shell.execute(cmd);
    return res.stdout;
  }

  /**
   * Structured Git diff by file.
   */
  public async diffStructured(staged = false): Promise<GitStructuredDiff> {
    const raw = await this.diff(staged);
    const files: GitStructuredDiff['files'] = [];

    const fileChunks = raw.split(/^diff --git /m).filter(Boolean);
    for (const chunk of fileChunks) {
      const headerLine = chunk.split('\n')[0] || '';
      const pathMatch = headerLine.match(/b\/(.+)$/);
      const filePath = pathMatch ? pathMatch[1] : 'unknown';

      let insertions = 0;
      let deletions = 0;
      for (const line of chunk.split('\n')) {
        if (line.startsWith('+') && !line.startsWith('+++')) insertions++;
        if (line.startsWith('-') && !line.startsWith('---')) deletions++;
      }

      files.push({
        path: filePath,
        insertions,
        deletions,
        patch: `diff --git ${chunk}`,
      });
    }

    return { files, raw };
  }

  /**
   * Safe branch creation with validation against command injection.
   */
  public async branchCreate(name: string, opts?: GitOperationOptions): Promise<string> {
    const trimmed = name.trim();
    if (!/^[a-zA-Z0-9_\-\.\/]+$/.test(trimmed) || trimmed.startsWith('-') || trimmed.includes('..')) {
      throw new Error(`Invalid Git branch name '${name}'. Branch names must not contain command injection characters or path traversal.`);
    }

    const res = await this.shell.execute(`git checkout -b ${trimmed}`, {
      isUserApproved: opts?.isUserApproved,
    });
    if (res.exitCode !== 0) {
      throw new Error(`Git branch creation failed: ${res.stderr || res.stdout}`);
    }
    return `Switched to a new branch '${trimmed}'`;
  }

  /**
   * Safe commit with secret scanning and approval provenance.
   */
  public async commit(message: string, opts?: GitOperationOptions): Promise<string> {
    // 1. Scan diff for secrets before committing (GAP-020 / NFR-SEC-001)
    const stagedDiff = await this.diff(true);
    const unstagedDiff = await this.diff(false);
    const fullDiff = `${stagedDiff}\n${unstagedDiff}`;

    if (
      this.secretGuard.containsSecret(fullDiff) ||
      fullDiff.includes('[REDACTED_KEY]') ||
      fullDiff.includes('[REDACTED_SECRET]')
    ) {
      throw new Error('Security Violation: Staged changes contain sensitive keys or tokens. Commit blocked.');
    }

    if (!message || message.trim().length === 0) {
      throw new Error('Git commit message cannot be empty.');
    }

    const safeMessage = message.replace(/"/g, '\\"');
    const res = await this.shell.execute(`git commit -m "${safeMessage}"`, {
      isUserApproved: opts?.isUserApproved,
    });
    if (res.exitCode !== 0) {
      throw new Error(`Git commit failed: ${res.stderr || res.stdout}`);
    }
    return res.stdout.trim();
  }

  /**
   * Safe push requiring explicit confirmation, force-push blocking, and protected branch checks.
   */
  public async push(
    remote = 'origin',
    branch?: string,
    force = false,
    opts?: GitOperationOptions
  ): Promise<string> {
    // 1. Force push policy: permanently block dangerous force pushes unless explicitly pre-authorized
    if (force) {
      throw new Error('Security Violation: Force-push is blocked by safety policy.');
    }

    // 2. Resolve target branch
    const branchRes = await this.shell.execute('git branch --show-current');
    const currentBranch = branch || branchRes.stdout.trim();

    // 3. Protected branch protections (GAP-020 §9.6 - 9.7)
    if (this.isProtectedBranch(currentBranch)) {
      if (!opts?.confirmed) {
        throw new Error(
          `Security Violation: Direct push to protected branch '${currentBranch}' requires explicit confirmation.`
        );
      }
    }

    // 4. Push requires explicit confirmation from user outside untrusted model output
    if (!opts?.confirmed && !opts?.isUserApproved) {
      throw new Error(
        `Push confirmation required: cannot push '${currentBranch}' to '${remote}' without explicit approval.`
      );
    }

    const res = await this.shell.execute(`git push ${remote} ${currentBranch}`, {
      isUserApproved: true, // Only after explicit confirmation above
    });
    if (res.exitCode !== 0) {
      throw new Error(`Git push failed: ${res.stderr || res.stdout}`);
    }
    return res.stdout.trim() || `Successfully pushed ${currentBranch} to ${remote}`;
  }

  /**
   * Non-destructive PR description draft generation (GAP-020 §9.8).
   */
  public async generatePrDraft(meta?: {
    goal?: string;
    taskSummary?: string;
    testsPassed?: boolean;
  }): Promise<string> {
    const status = await this.statusStructured();
    const diff = await this.diffStructured(false);

    let logRes = '';
    try {
      const logs = await this.shell.execute('git log -n 5 --oneline');
      logRes = logs.stdout.trim();
    } catch {
      // Non-fatal
    }

    const changedFiles = Array.from(new Set([...status.staged, ...status.unstaged, ...diff.files.map((f) => f.path)]));

    const lines: string[] = [];
    lines.push(`## Pull Request: ${meta?.goal || `Changes on ${status.branch}`}`);
    lines.push('');
    lines.push('### Overview');
    lines.push(meta?.taskSummary || meta?.goal || 'Automated code changes orchestrated by FlappyCode.');
    lines.push('');
    lines.push('### Modified Files');
    if (changedFiles.length > 0) {
      for (const file of changedFiles) {
        lines.push(`- \`${file}\``);
      }
    } else {
      lines.push('- No files modified.');
    }
    lines.push('');
    if (logRes) {
      lines.push('### Recent Commits');
      lines.push('```text');
      lines.push(logRes);
      lines.push('```');
      lines.push('');
    }
    lines.push('### Verification');
    lines.push(meta?.testsPassed ? '- [x] Automated tests and linting passed' : '- [ ] Verification in progress');
    lines.push('');
    lines.push('> Draft generated by FlappyCode.');

    return lines.join('\n');
  }
}
