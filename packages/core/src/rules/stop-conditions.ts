export interface StopConditionCheck {
  shouldStop: boolean;
  reason?: string;
  kind?: 'destructive' | 'breaking_api' | 'migration' | 'rule_conflict';
}

export class StopConditions {
  private static DESTRUCTIVE_SHELL_PATTERNS = [
    /\brm\s+-rf\b/i,
    /\brmdir\s+\/s\s+\/q\b/i,
    /\bgit\s+push\s+.*--force\b/i,
    /\bgit\s+reset\s+--hard\b/i,
    /\bdrop\s+table\b/i,
    /\bdrop\s+database\b/i,
    /\bmkfs\b/i,
  ];

  private static IRREVERSIBLE_MIGRATION_PATTERNS = [
    /\bDROP\s+TABLE\b/i,
    /\bDROP\s+COLUMN\b/i,
    /\bTRUNCATE\b/i,
    /\bALTER\s+TABLE\s+.*\bDROP\b/i,
    /\bDROP\s+DATABASE\b/i,
  ];

  public static checkShellCommand(cmd: string): StopConditionCheck {
    for (const pattern of this.DESTRUCTIVE_SHELL_PATTERNS) {
      if (pattern.test(cmd)) {
        return {
          shouldStop: true,
          kind: 'destructive',
          reason: `Command '${cmd}' is classified as destructive and requires explicit interactive confirmation.`,
        };
      }
    }
    return { shouldStop: false };
  }

  public static checkFileOperation(
    op: 'write' | 'delete',
    filePath: string,
    isApproved: boolean
  ): StopConditionCheck {
    if (!isApproved) {
      return {
        shouldStop: true,
        kind: 'destructive',
        reason: `File operation '${op}' on '${filePath}' cannot proceed without plan approval token.`,
      };
    }
    return { shouldStop: false };
  }

  public static checkMigration(content: string): StopConditionCheck {
    for (const pattern of this.IRREVERSIBLE_MIGRATION_PATTERNS) {
      if (pattern.test(content)) {
        return {
          shouldStop: true,
          kind: 'migration',
          reason: `Irreversible database migration detected (${pattern.source}). Requires explicit user approval.`,
        };
      }
    }
    return { shouldStop: false };
  }

  public static checkApiChange(
    oldContent: string | null,
    newContent: string,
    filePath: string
  ): StopConditionCheck {
    // Only inspect probable API surface files
    const isApiSurface =
      /(?:api|index|types|interface|contract|client|routes|sdk)\.[jt]sx?$/i.test(filePath) ||
      filePath.includes('/api/') ||
      filePath.includes('\\api\\');

    if (!isApiSurface || oldContent === null) {
      return { shouldStop: false };
    }

    // Detect removed exports
    const exportRegex = /export\s+(?:(?:async\s+)?function|class|interface|type|const|let)\s+([a-zA-Z0-9_$]+)/g;
    const oldExports = new Set<string>();
    let match: RegExpExecArray | null;
    while ((match = exportRegex.exec(oldContent)) !== null) {
      oldExports.add(match[1]);
    }

    const newExports = new Set<string>();
    while ((match = exportRegex.exec(newContent)) !== null) {
      newExports.add(match[1]);
    }

    const removed = Array.from(oldExports).filter((sym) => !newExports.has(sym));
    if (removed.length > 0) {
      return {
        shouldStop: true,
        kind: 'breaking_api',
        reason: `Potential breaking API change in '${filePath}': removed exported symbol(s): ${removed.join(', ')}.`,
      };
    }

    return { shouldStop: false };
  }

  public static checkRuleConflicts(conflicts: string[]): StopConditionCheck {
    if (conflicts && conflicts.length > 0) {
      return {
        shouldStop: true,
        kind: 'rule_conflict',
        reason: `Unresolvable rule conflicts detected: ${conflicts.join('; ')}. Requires user resolution.`,
      };
    }
    return { shouldStop: false };
  }
}
