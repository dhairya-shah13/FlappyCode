import yaml from 'js-yaml';
import type { ParsedRuleFile, Rule, RuleFileMetadata } from './types.js';

export const CORE_RULE_PREFIXES = ['SEC-', 'PLAN-', 'NEVER-', 'STOP-'] as const;

export function isCoreRule(id: string): boolean {
  const upper = id.toUpperCase();
  return CORE_RULE_PREFIXES.some((prefix) => upper.startsWith(prefix));
}

const FRONTMATTER_REGEX = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;
const RULE_ITEM_REGEX = /^\s*[-*]\s+\[([A-Za-z0-9_-]+)\]\s+(.*)$/;

export function parseRuleContent(content: string, sourcePath: string, precedence = 0): ParsedRuleFile {
  let body = content;
  let metadata: RuleFileMetadata = {};

  const match = content.match(FRONTMATTER_REGEX);
  if (match) {
    const rawYaml = match[1];
    body = content.slice(match[0].length);
    try {
      const parsed = yaml.load(rawYaml);
      if (parsed && typeof parsed === 'object') {
        metadata = parsed as RuleFileMetadata;
      }
    } catch {
      // If frontmatter YAML fails to parse, treat metadata as empty
      metadata = {};
    }
  }

  const lines = body.split(/\r?\n/);
  const rules: Rule[] = [];
  let currentRule: Rule | null = null;

  for (const line of lines) {
    const itemMatch = line.match(RULE_ITEM_REGEX);
    if (itemMatch) {
      if (currentRule) {
        rules.push(currentRule);
      }
      const id = itemMatch[1].trim();
      const text = itemMatch[2].trim();
      currentRule = {
        id,
        text,
        source: sourcePath,
        scope: metadata.scope,
        isCore: isCoreRule(id),
        precedence,
      };
    } else if (currentRule && line.match(/^\s{2,}\S/)) {
      // Continuation line indented by 2+ spaces
      currentRule.text += ' ' + line.trim();
    } else if (line.trim().length === 0 || line.startsWith('#')) {
      if (currentRule) {
        rules.push(currentRule);
        currentRule = null;
      }
    }
  }

  if (currentRule) {
    rules.push(currentRule);
  }

  return {
    filePath: sourcePath,
    metadata,
    rules,
  };
}
