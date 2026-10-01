import fs from 'node:fs';
import path from 'node:path';
import { AgentDefinition, AgentDefinitionSchema } from '@flappycode/protocol';
import { BUILTIN_AGENTS } from './agent-definitions.js';

export interface AgentLoadResult {
  agents: Record<string, AgentDefinition>;
  errors: Array<{ file: string; error: string }>;
}

/**
 * Minimal YAML-subset parser for agent definition files (GAP-008 / SystemArchitecture §6.5).
 * Supports the documented flat schema only:
 *   key: scalar
 *   key: [a, b]
 *   key:
 *     - item
 *   system_prompt: |
 *     indented block lines
 * Anything outside this subset produces a clear error rather than silent misparsing.
 */
export function parseAgentYaml(text: string, file: string): Record<string, any> {
  const result: Record<string, any> = {};
  const lines = text.split(/\r?\n/);
  let i = 0;

  while (i < lines.length) {
    const raw = lines[i];
    if (!raw.trim() || raw.trim().startsWith('#')) {
      i++;
      continue;
    }
    const match = raw.match(/^([A-Za-z_][\w-]*):\s*(.*)$/);
    if (!match) {
      throw new Error(
        `${file}: invalid line ${i + 1}: expected 'key: value' — got '${raw.trim().slice(0, 60)}'`
      );
    }
    const key = match[1];
    let value = match[2];

    if (value === '|' || value === '>') {
      // Block scalar: collect indented lines
      const block: string[] = [];
      i++;
      while (i < lines.length && (/^\s+/.test(lines[i]) || !lines[i].trim())) {
        block.push(lines[i].trim() ? lines[i] : '');
        i++;
      }
      result[key] = value === '|' ? block.join('\n') : block.join(' ').trim();
      continue;
    }

    if (value === '') {
      // Possibly an array block
      const items: string[] = [];
      i++;
      while (i < lines.length && /^\s*-\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*-\s+/, '').trim().replace(/^["']|["']$/g, ''));
        i++;
      }
      if (items.length > 0) {
        result[key] = items;
      } else {
        result[key] = '';
      }
      continue;
    }

    if (value.startsWith('[') && value.endsWith(']')) {
      result[key] = value
        .slice(1, -1)
        .split(',')
        .map((s) => s.trim().replace(/^["']|["']$/g, ''))
        .filter((s) => s.length > 0);
    } else {
      result[key] = value.replace(/^["']|["']$/g, '');
    }
    i++;
  }
  return result;
}

function loadAgentFile(filePath: string): AgentDefinition {
  const ext = path.extname(filePath).toLowerCase();
  const base = path.basename(filePath, ext);
  let raw: Record<string, any>;

  if (ext === '.json') {
    try {
      raw = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch (err: any) {
      throw new Error(`${filePath}: invalid JSON — ${err.message}`);
    }
  } else if (ext === '.yaml' || ext === '.yml') {
    raw = parseAgentYaml(fs.readFileSync(filePath, 'utf8'), filePath);
  } else if (ext === '.md') {
    const content = fs.readFileSync(filePath, 'utf8');
    const fm = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
    if (fm) {
      raw = parseAgentYaml(fm[1], filePath);
      if (!raw.system_prompt || String(raw.system_prompt).trim() === '') {
        raw.system_prompt = fm[2].trim();
      }
    } else {
      raw = { system_prompt: content.trim() };
    }
    if (!raw.name) raw.name = base;
  } else {
    throw new Error(`${filePath}: unsupported agent definition extension '${ext}' (use .md, .yaml, .yml, or .json)`);
  }

  if (!raw.name) raw.name = base;
  const parsed = AgentDefinitionSchema.safeParse(raw);
  if (!parsed.success) {
    const details = parsed.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`).join('; ');
    throw new Error(`${filePath}: invalid agent definition — ${details}`);
  }
  return parsed.data;
}

/**
 * Load custom agents from `<projectRoot>/.flappycode/agents/`.
 * Deterministic override precedence: custom agents with the same name as a
 * built-in REPLACE the built-in. Invalid files are reported, never silently ignored.
 */
export function loadAgentsFromProject(projectRoot: string): AgentLoadResult {
  const agentsDir = path.join(projectRoot, '.flappycode', 'agents');
  const agents: Record<string, AgentDefinition> = {};
  const errors: Array<{ file: string; error: string }> = [];

  if (!fs.existsSync(agentsDir)) {
    return { agents, errors };
  }

  const files = fs
    .readdirSync(agentsDir)
    .filter((f) => ['.md', '.yaml', '.yml', '.json'].includes(path.extname(f).toLowerCase()))
    .sort();

  for (const file of files) {
    const full = path.join(agentsDir, file);
    try {
      const def = loadAgentFile(full);
      agents[def.name] = def;
    } catch (err: any) {
      errors.push({ file: full, error: err.message });
    }
  }
  return { agents, errors };
}

/** Merge custom agents over built-ins deterministically. */
export function mergeAgents(custom: Record<string, AgentDefinition>): Record<string, AgentDefinition> {
  return { ...BUILTIN_AGENTS, ...custom };
}
