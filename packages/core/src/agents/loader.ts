import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';
import { AgentDefinition, AgentDefinitionSchema } from '@flappycode/protocol';

export function findBuiltinAgentsDir(customDir?: string): string {
  if (customDir && fs.existsSync(customDir)) {
    return path.resolve(customDir);
  }

  // Walk up from current file
  try {
    let current = path.dirname(fileURLToPath(import.meta.url));
    for (let i = 0; i < 5; i++) {
      const candidate = path.join(current, 'agents');
      if (fs.existsSync(candidate) && fs.existsSync(path.join(candidate, 'coder.md'))) {
        return candidate;
      }
      const candidateInCore = path.join(current, 'packages', 'core', 'agents');
      if (fs.existsSync(candidateInCore)) {
        return candidateInCore;
      }
      const parent = path.dirname(current);
      if (parent === current) break;
      current = parent;
    }
  } catch {
    // ignore
  }

  return path.resolve(process.cwd(), 'packages', 'core', 'agents');
}

export function parseAgentDefinition(content: string, sourcePath: string): AgentDefinition {
  const frontmatterRegex = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;
  const match = content.match(frontmatterRegex);

  let rawMeta: Record<string, unknown> = {};
  let body = content;

  if (match) {
    body = content.slice(match[0].length).trim();
    const loaded = yaml.load(match[1]);
    if (loaded && typeof loaded === 'object') {
      rawMeta = loaded as Record<string, unknown>;
    }
  }

  // If systemPrompt is not in frontmatter, body becomes the systemPrompt
  if (!rawMeta.systemPrompt && body.length > 0) {
    rawMeta.systemPrompt = body;
  }

  try {
    return AgentDefinitionSchema.parse(rawMeta);
  } catch (err) {
    throw new Error(`Invalid agent definition in ${sourcePath}: ${err instanceof Error ? err.message : String(err)}`);
  }
}

export interface LoadAgentsOptions {
  projectRoot: string;
  userAgentsDir?: string;
  builtinAgentsDir?: string;
}

export function loadAllAgents(options: LoadAgentsOptions): Map<string, AgentDefinition> {
  const agentMap = new Map<string, AgentDefinition>();
  const projectRoot = path.resolve(options.projectRoot);

  const loadFromDir = (dir: string) => {
    if (!fs.existsSync(dir)) return;
    try {
      const entries = fs.readdirSync(dir);
      for (const entry of entries) {
        if (entry.endsWith('.md') || entry.endsWith('.yaml') || entry.endsWith('.yml')) {
          const filePath = path.join(dir, entry);
          const content = fs.readFileSync(filePath, 'utf8');
          const agent = parseAgentDefinition(content, filePath);
          agentMap.set(agent.name.toLowerCase(), agent);
        }
      }
    } catch {
      // ignore directory read issues
    }
  };

  // 1. Shipped / built-in agents (precedence 1)
  const builtinDir = findBuiltinAgentsDir(options.builtinAgentsDir);
  loadFromDir(builtinDir);

  // 2. User-global agents (precedence 2)
  const userDir = options.userAgentsDir
    ? path.resolve(options.userAgentsDir)
    : path.join(os.homedir(), '.flappycode', 'agents');
  loadFromDir(userDir);

  // 3. Project-local agents (precedence 3)
  const projectAgentsDir = path.join(projectRoot, '.flappycode', 'agents');
  loadFromDir(projectAgentsDir);

  return agentMap;
}

export function getAgent(name: string, options: LoadAgentsOptions): AgentDefinition | null {
  const all = loadAllAgents(options);
  return all.get(name.toLowerCase()) || null;
}
