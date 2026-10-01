import { ShellTool } from './shell-tool.js';
import { SecretGuard } from './secret-guard.js';

export class GitTool {
  constructor(
    private shell: ShellTool,
    private secretGuard: SecretGuard
  ) {}

  public async status(): Promise<string> {
    const res = await this.shell.execute('git status --short', { isUserApproved: true });
    return res.stdout.trim();
  }

  public async diff(): Promise<string> {
    const res = await this.shell.execute('git diff', { isUserApproved: true });
    return res.stdout;
  }

  public async branchCreate(name: string): Promise<string> {
    // Sanitize branch name
    const safeName = name.replace(/[^a-zA-Z0-9_/-]/g, '-');
    const res = await this.shell.execute(`git checkout -b ${safeName}`, { isUserApproved: true });
    if (res.exitCode !== 0) {
      throw new Error(`Git branch creation failed: ${res.stderr}`);
    }
    return `Switched to a new branch '${safeName}'`;
  }

  public async commit(message: string): Promise<string> {
    // Verify commit diff does not contain secrets per NFR-SEC-001
    const diff = await this.diff();
    if (this.secretGuard.containsSecret(diff)) {
      throw new Error('Security Violation: Staged changes contain sensitive keys or tokens. Commit blocked.');
    }

    const safeMessage = message.replace(/"/g, '\\"');
    const res = await this.shell.execute(`git commit -m "${safeMessage}"`, { isUserApproved: true });
    if (res.exitCode !== 0) {
      throw new Error(`Git commit failed: ${res.stderr || res.stdout}`);
    }
    return res.stdout.trim();
  }

  public async push(remote = 'origin', branch?: string, force = false): Promise<string> {
    if (force) {
      throw new Error('Security Violation: Force-push is blocked by safety policy.');
    }
    const currentBranch = branch || (await this.shell.execute('git branch --show-current', { isUserApproved: true })).stdout.trim();
    if (currentBranch === 'main' || currentBranch === 'master') {
      throw new Error(`Security Violation: Direct push to protected branch '${currentBranch}' requires explicit confirmation.`);
    }

    const res = await this.shell.execute(`git push ${remote} ${currentBranch}`, { isUserApproved: true });
    return res.stdout;
  }
}
