import { PermissionConfig } from '@flappycode/protocol';
import { StopConditions } from '../rules/stop-conditions.js';

export type PermissionDecision = 'allow' | 'ask' | 'deny';

export class PermissionEngine {
  private projectAllowPatterns: Set<string> = new Set();

  constructor(private config: PermissionConfig) {
    for (const pat of config.shell_allow || []) {
      this.projectAllowPatterns.add(pat);
    }
  }

  public checkCommand(command: string): { decision: PermissionDecision; reason?: string; isDestructive?: boolean } {
    const trimmed = command.trim();

    // 1. Deny list (hard block wins over everything)
    for (const pat of this.config.shell_deny || []) {
      if (this.matchesPattern(trimmed, pat)) {
        return {
          decision: 'deny',
          reason: `Command '${command}' matches deny-list pattern '${pat}'`,
        };
      }
    }

    // 2. Destructive command check (mandatory user confirmation)
    const destructive = StopConditions.checkShellCommand(trimmed);
    if (destructive.shouldStop) {
      return {
        decision: 'ask',
        isDestructive: true,
        reason: destructive.reason,
      };
    }

    // 3. Project allow list (always allowed)
    for (const pat of this.projectAllowPatterns) {
      if (this.matchesPattern(trimmed, pat)) {
        return { decision: 'allow' };
      }
    }

    // 4. Default: ask
    return { decision: 'ask', reason: 'Shell execution requires user approval' };
  }

  public allowCommandPattern(pattern: string): boolean {
    // Destructive commands cannot be permanently allow-listed per Section 17 of Prompt & Architecture
    const destructive = StopConditions.checkShellCommand(pattern);
    if (destructive.shouldStop) {
      return false;
    }
    this.projectAllowPatterns.add(pattern);
    return true;
  }

  private matchesPattern(cmd: string, pattern: string): boolean {
    if (pattern === '*' || pattern === cmd) return true;
    if (pattern.endsWith('*')) {
      const prefix = pattern.slice(0, -1);
      return cmd.startsWith(prefix);
    }
    return cmd === pattern;
  }
}
