import { ChatMessage } from '@flappycode/providers';
import { ProjectMemoryRepository } from '@flappycode/storage';

export interface AgentContextSlice {
  goal: string;
  files: Array<{ path: string; content: string }>;
  turns: ChatMessage[];
  compacted: boolean;
}

/**
 * Role-specific context slice builder (GAP-026).
 * Each agent type receives only the context it needs.
 */
export type AgentRole = 'File-Finder' | 'Coder' | 'Tester' | 'Reviewer' | 'Command-Executor' | 'Codebase-Analyst';

export interface AgentSliceInput {
  goal: string;
  history: ChatMessage[];
  relevantFiles?: Array<{ path: string; content: string }>;
  directoryTree?: string[];
  searchContext?: string;
  plan?: string;
  feedbackHistory?: string;
  testFailures?: string;
  changedFiles?: string[];
  testCommands?: string[];
  previousTestOutput?: string;
  unifiedDiff?: string;
  codingRules?: string;
  testerVerdict?: string;
  modelContextLength?: number;
}

export class ContextManager {
  private inMemoryStore = new Map<string, string>(); // key -> value
  private projectMemoryRepo?: ProjectMemoryRepository;
  private projectPath?: string;

  /** Wire the SQLite-backed project memory (called once during engine setup). */
  public initProjectMemory(repo: ProjectMemoryRepository, projectPath: string): void {
    this.projectMemoryRepo = repo;
    this.projectPath = projectPath;
  }

  public setMemory(key: string, value: string): void {
    this.inMemoryStore.set(key, value);
    if (this.projectMemoryRepo && this.projectPath) {
      try {
        this.projectMemoryRepo.set(this.projectPath, key, value);
      } catch { /* persistence must not block orchestration */ }
    }
  }

  public getMemory(key: string): string | undefined {
    const inMem = this.inMemoryStore.get(key);
    if (inMem !== undefined) return inMem;
    if (this.projectMemoryRepo && this.projectPath) {
      try {
        const persisted = this.projectMemoryRepo.get(this.projectPath, key);
        if (persisted !== undefined) {
          this.inMemoryStore.set(key, persisted); // warm cache
        }
        return persisted;
      } catch { /* non-fatal */ }
    }
    return undefined;
  }

  /**
   * Build a role-specific context slice (GAP-026 FR-CTX-002).
   * Each agent role receives a focused, token-efficient context subset.
   */
  public buildAgentSlice(role: AgentRole, input: AgentSliceInput): AgentContextSlice {
    const contextMessages: ChatMessage[] = [];

    switch (role) {
      case 'File-Finder':
        contextMessages.push({
          role: 'system',
          content: [
            `Task goal: ${input.goal}`,
            input.directoryTree ? `Directory tree:\n${input.directoryTree.slice(0, 50).join('\n')}` : '',
            input.searchContext ? `Search context: ${input.searchContext}` : '',
          ].filter(Boolean).join('\n\n'),
        });
        break;

      case 'Coder':
        contextMessages.push({
          role: 'system',
          content: [
            `Task goal: ${input.goal}`,
            input.plan ? `Approved plan:\n${input.plan}` : '',
            input.feedbackHistory ? `Previous feedback:\n${input.feedbackHistory}` : '',
            input.testFailures ? `Test failures to fix:\n${input.testFailures}` : '',
          ].filter(Boolean).join('\n\n'),
        });
        break;

      case 'Tester':
        contextMessages.push({
          role: 'system',
          content: [
            `Task goal: ${input.goal}`,
            input.changedFiles ? `Changed files: ${input.changedFiles.join(', ')}` : '',
            input.testCommands ? `Test commands: ${input.testCommands.join(', ')}` : '',
            input.previousTestOutput ? `Previous output:\n${input.previousTestOutput}` : '',
          ].filter(Boolean).join('\n\n'),
        });
        break;

      case 'Reviewer':
        contextMessages.push({
          role: 'system',
          content: [
            `Task goal: ${input.goal}`,
            input.unifiedDiff ? `Unified diff:\n${input.unifiedDiff}` : '',
            input.codingRules ? `Coding rules:\n${input.codingRules}` : '',
            input.testerVerdict ? `Tester verdict: ${input.testerVerdict}` : '',
          ].filter(Boolean).join('\n\n'),
        });
        break;

      default:
        contextMessages.push({
          role: 'system',
          content: `Task goal: ${input.goal}`,
        });
        break;
    }

    // Append the full conversation history after the context-specific system message
    contextMessages.push(...input.history);

    return this.buildContextSlice(
      input.goal,
      contextMessages,
      input.relevantFiles,
      input.modelContextLength
    );
  }

  public buildContextSlice(
    goal: string,
    history: ChatMessage[],
    relevantFiles: Array<{ path: string; content: string }> = [],
    modelContextLength = 32768
  ): AgentContextSlice {
    // Estimate tokens (roughly 4 chars per token)
    let totalChars = goal.length;
    for (const f of relevantFiles) {
      totalChars += f.path.length + f.content.length;
    }
    for (const h of history) {
      totalChars += h.content.length;
    }

    const estimatedTokens = Math.ceil(totalChars / 4);
    const threshold = Math.floor(modelContextLength * 0.8);
    let compacted = false;
    let turns = [...history];

    if (estimatedTokens > threshold && turns.length > 4) {
      compacted = true;
      // Summarize older turns: retain first turn + summarize middle turns + retain last 2 turns
      const firstTurn = turns[0];
      const recentTurns = turns.slice(-2);
      const middleTurns = turns.slice(1, -2);
      const summaryText = `[Context compacted: ${middleTurns.length} earlier turns omitted for token conservation]`;

      turns = [
        firstTurn,
        { role: 'assistant', content: summaryText },
        ...recentTurns,
      ];
    }

    return {
      goal,
      files: relevantFiles,
      turns,
      compacted,
    };
  }
}
