export interface Rule {
  id: string;
  text: string;
  category?: string;
  source: string;
  scope?: string;
  isCore: boolean;
  precedence: number;
}

export type ConflictReason = 'weakens_core_rule' | 'undeclared_override' | 'ambiguous_definition';

export interface RuleConflict {
  ruleId: string;
  existingRule: Rule;
  conflictingRule: Rule;
  reason: ConflictReason;
  message: string;
}

export interface RuleFileMetadata {
  scope?: string;
  overrides?: string[];
  [key: string]: unknown;
}

export interface ParsedRuleFile {
  filePath: string;
  metadata: RuleFileMetadata;
  rules: Rule[];
}

export interface LoadRulesOptions {
  projectRoot: string;
  targetPath?: string;
  categories?: string[];
  userRulesDir?: string;
  shippedRulesDir?: string;
  enableAutoDetectCategories?: boolean;
}

export interface LoadedRules {
  rules: Rule[];
  conflicts: RuleConflict[];
  activeCategories: string[];
  sources: string[];
  renderPromptBlock(): string;
  hasErrors(): boolean;
}
