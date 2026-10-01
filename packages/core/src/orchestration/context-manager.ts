import { ChatMessage } from '@flappycode/providers';

export interface AgentContextSlice {
  goal: string;
  files: Array<{ path: string; content: string }>;
  turns: ChatMessage[];
  compacted: boolean;
}

export class ContextManager {
  private projectMemory = new Map<string, string>(); // key -> value

  public setMemory(key: string, value: string): void {
    this.projectMemory.set(key, value);
  }

  public getMemory(key: string): string | undefined {
    return this.projectMemory.get(key);
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
