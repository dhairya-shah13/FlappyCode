import { AgentDefinition, PlanProposal, PlanProposalSchema } from '@flappycode/protocol';
import { CompletionRequest, ProviderConnector } from '@flappycode/providers';
import { ProviderConfig } from '@flappycode/protocol';

/** Raised when planner output is invalid after exactly one repair attempt (FR-ORC-011). */
export class PlannerOutputError extends Error {
  public readonly code = 'PLANNER_INVALID_OUTPUT';
  constructor(message: string, public readonly sample: string) {
    super(message);
    this.name = 'PlannerOutputError';
  }
}

export class TaskPlanner {
  /**
   * Build the agent listing section dynamically from available agents (GAP-008).
   * This ensures the planner knows about custom agents defined in .flappycode/agents/.
   */
  private static buildAgentList(agents: Record<string, AgentDefinition>): string {
    return Object.entries(agents)
      .map(([name, def]) => `  - "${name}": ${def.system_prompt.slice(0, 80)}`)
      .join('\n');
  }

  public static async generatePlan(
    connector: ProviderConnector,
    cfg: ProviderConfig,
    plannerModel: string,
    prompt: string,
    projectFiles: string[],
    rulesSummary: string,
    apiKey?: string,
    signal?: AbortSignal,
    runId?: string,
    /** Available agents including custom (GAP-008). */
    availableAgents?: Record<string, AgentDefinition>
  ): Promise<PlanProposal> {
    const planRunId = runId ?? `run_${Date.now()}`;

    const agentNames = availableAgents
      ? Object.keys(availableAgents).map((n) => `"${n}"`).join(' | ')
      : '"File-Finder" | "Coder" | "Tester" | "Reviewer" | "Command-Executor" | "Codebase-Analyst"';

    const agentDescriptions = availableAgents
      ? `Available agents:\n${this.buildAgentList(availableAgents)}`
      : '';

    const systemPrompt = `You are FlappyCode's Planner agent.
Your task is to decompose the user's coding request into a structured JSON task graph.

RULES:
${rulesSummary}

${agentDescriptions}

You MUST return ONLY valid JSON matching this schema:
{
  "goal": "summary of the user goal",
  "files_to_modify": ["path1", "path2"],
  "assumptions": ["assumption1"],
  "risks": ["risk1"],
  "nodes": [
    {
      "id": "node-1",
      "agent": ${agentNames},
      "description": "action description",
      "depends_on": []
    }
  ]
}
Project files available:
${projectFiles.slice(0, 30).join('\n')}
`;

    const req: CompletionRequest = {
      model: plannerModel,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: prompt },
      ],
      temperature: 0.1,
      signal,
    };

    let responseText = '';
    for await (const chunk of connector.complete(cfg, req, apiKey)) {
      if (chunk.delta) responseText += chunk.delta;
    }

    let parsed = this.tryParseJson(responseText);

    // If first attempt fails, perform EXACTLY ONE repair attempt per FR-ORC-011
    // GAP-046: structured repair prompt includes the actual validation errors
    if (!parsed) {
      const schemaDescription = `Required JSON schema: { goal: string, files_to_modify: string[], assumptions: string[], risks: string[], nodes: [{ id: string, agent: string (one of ${agentNames}), description: string, depends_on: string[] }] }`;

      const repairReq: CompletionRequest = {
        model: plannerModel,
        messages: [
          {
            role: 'system',
            content: `You fix invalid JSON output from a planner. Output ONLY the corrected valid JSON.\n\n${schemaDescription}`,
          },
          {
            role: 'user',
            content: `The following text was supposed to be valid JSON matching the schema above but failed to parse. Repair and output ONLY the corrected valid JSON:\n\n${responseText}`,
          },
        ],
        temperature: 0,
      };

      let repairText = '';
      for await (const chunk of connector.complete(cfg, { ...repairReq, signal }, apiKey)) {
        if (chunk.delta) repairText += chunk.delta;
      }
      parsed = this.tryParseJson(repairText);
    }

    if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.nodes) || parsed.nodes.length === 0) {
      // FR-ORC-011: after exactly one repair attempt, THROW so the fallback
      // executor can route planning to the next eligible model. Never silently
      // substitute a default graph as though planning succeeded.
      throw new PlannerOutputError(
        `Planner model '${plannerModel}' produced invalid output after one repair attempt.`,
        responseText.slice(0, 500)
      );
    }

    const planProposal: PlanProposal = {
      run_id: planRunId,
      goal: parsed.goal || prompt,
      graph: {
        id: `graph_${Date.now()}`,
        goal: parsed.goal || prompt,
        nodes: (parsed.nodes || []).map((n: any, idx: number) => ({
          id: n.id || `node-${idx + 1}`,
          agent: n.agent || 'Coder',
          description: n.description || '',
          depends_on: n.depends_on || [],
          status: 'pending',
          substitutions: [],
          tool_calls: [],
        })),
        created_at: Date.now(),
      },
      files_to_modify: Array.isArray(parsed.files_to_modify) ? parsed.files_to_modify : [],
      assumptions: parsed.assumptions || [],
      risks: parsed.risks || [],
      planner_model: plannerModel,
      timestamp: Date.now(),
    };

    return PlanProposalSchema.parse(planProposal);
  }

  private static tryParseJson(text: string): any {
    try {
      const cleaned = text.trim().replace(/^```json/i, '').replace(/```$/i, '').trim();
      return JSON.parse(cleaned);
    } catch {
      return null;
    }
  }
}
