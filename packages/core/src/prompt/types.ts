import type { AgentDefinition } from '@flappycode/protocol';
import type { LoadedRules } from '../rules/types.js';

export interface ProjectContextSlice {
  projectPath?: string;
  contextMarkdown?: string;
  memory?: Record<string, string>;
  activeCategories?: string[];
}

export interface PromptComposerOptions {
  rules: LoadedRules;
  agent: AgentDefinition;
  projectContext?: ProjectContextSlice;
  customInstructions?: string;
}

export interface ComposedPrompt {
  systemPrompt: string;
  rulesBlock: string;
  agentBlock: string;
  contextBlock?: string;
  totalCharacters: number;
}
