import { RulesMissingError } from './errors.js';
import type { ComposedPrompt, PromptComposerOptions } from './types.js';

export function composePrompt(options: PromptComposerOptions): ComposedPrompt {
  // Enforce mandatory rules check
  if (!options.rules || !options.rules.rules || options.rules.rules.length === 0) {
    throw new RulesMissingError(
      'Cannot compose prompt: mandatory operating rules are missing. All FlappyCode agents must run under RULES.md.'
    );
  }

  const sections: string[] = [];

  // Section 1: Core Preamble
  const preamble = [
    '# FlappyCode Autonomous Agent Preamble',
    'You are a specialist coding agent operating within the FlappyCode multi-agent engine.',
    'You pool free LLM provider resources to produce reliable, high-quality, and secure software changes.',
    'You MUST strictly obey all operating rules, stop conditions, and untrusted content boundaries detailed below.',
  ].join('\n');
  sections.push(preamble);

  // Section 2: Operating Rules Block (Mandatory)
  const rulesBlock = options.rules.renderPromptBlock();
  sections.push(rulesBlock);

  // Section 3: Agent Persona & Instructions
  const agentLines: string[] = [
    `# Agent Persona: ${options.agent.name.toUpperCase()}`,
    `Description: ${options.agent.description}`,
    `Allowed Tools: [${options.agent.allowedTools.join(', ')}]`,
    `Assigned Model: ${options.agent.model}`,
    `Fallback Policy: ${options.agent.fallbackPolicy}`,
    '',
    '## Specialist Role Instructions',
    options.agent.systemPrompt || 'Execute your assigned subtasks with utmost precision.',
  ];
  const agentBlock = agentLines.join('\n');
  sections.push(agentBlock);

  // Section 4: Project Context Slice (Optional)
  let contextBlock: string | undefined;
  if (options.projectContext) {
    const ctx = options.projectContext;
    const ctxLines: string[] = ['# Project Context'];

    if (ctx.projectPath) {
      ctxLines.push(`- Project Root: ${ctx.projectPath}`);
    }
    if (ctx.activeCategories && ctx.activeCategories.length > 0) {
      ctxLines.push(`- Active Categories: ${ctx.activeCategories.join(', ')}`);
    }

    if (ctx.memory && Object.keys(ctx.memory).length > 0) {
      ctxLines.push('', '## Project Memory & Conventions');
      for (const [k, v] of Object.entries(ctx.memory)) {
        ctxLines.push(`- **${k}**: ${v}`);
      }
    }

    if (ctx.contextMarkdown) {
      ctxLines.push('', '## Current Project State (Context.md)', ctx.contextMarkdown);
    }

    contextBlock = ctxLines.join('\n');
    sections.push(contextBlock);
  }

  // Section 5: Custom Run Instructions (Optional)
  if (options.customInstructions) {
    sections.push(['# Additional Task Instructions', options.customInstructions].join('\n'));
  }

  const systemPrompt = sections.join('\n\n---\n\n');

  return {
    systemPrompt,
    rulesBlock,
    agentBlock,
    contextBlock,
    totalCharacters: systemPrompt.length,
  };
}
