import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ProviderProfile, ProviderProfileSchema } from './schema.js';

export function findProfilesDir(customDir?: string): string {
  if (customDir && fs.existsSync(customDir)) {
    return path.resolve(customDir);
  }

  // Walk up from current file
  try {
    let current = path.dirname(fileURLToPath(import.meta.url));
    for (let i = 0; i < 5; i++) {
      const candidate = path.join(current, 'profiles');
      if (fs.existsSync(candidate) && fs.existsSync(path.join(candidate, 'groq.json'))) {
        return candidate;
      }
      const candidateInPkg = path.join(current, 'packages', 'providers', 'profiles');
      if (fs.existsSync(candidateInPkg)) {
        return candidateInPkg;
      }
      const parent = path.dirname(current);
      if (parent === current) break;
      current = parent;
    }
  } catch {
    // ignore
  }

  return path.resolve(process.cwd(), 'packages', 'providers', 'profiles');
}

export function loadAllProfiles(customDir?: string): ProviderProfile[] {
  const dir = findProfilesDir(customDir);
  if (!fs.existsSync(dir)) {
    return [];
  }

  const entries = fs.readdirSync(dir).filter((e) => e.endsWith('.json'));
  const profiles: ProviderProfile[] = [];

  for (const entry of entries) {
    const fullPath = path.join(dir, entry);
    const raw = fs.readFileSync(fullPath, 'utf8');
    try {
      const parsedJson = JSON.parse(raw);
      const validated = ProviderProfileSchema.parse(parsedJson);
      profiles.push(validated);
    } catch (err) {
      throw new Error(`Failed to validate provider profile in ${fullPath}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return profiles.sort((a, b) => a.name.localeCompare(b.name));
}

export function loadProfile(id: string, customDir?: string): ProviderProfile | null {
  const all = loadAllProfiles(customDir);
  return all.find((p) => p.id === id) || null;
}

export function getNeedsHumanVerificationList(profiles?: ProviderProfile[]): ProviderProfile[] {
  const list = profiles ?? loadAllProfiles();
  return list.filter((p) => p.needsHumanVerification);
}

export function generateProvidersMarkdownTable(profiles?: ProviderProfile[]): string {
  const list = profiles ?? loadAllProfiles();

  const lines: string[] = [
    '# FlappyCode Provider Verification Matrix',
    '',
    '| Provider | Type | Base URL | Auth Scheme | Free Tier Limits | Data Use (Trains) | Discovery | Tool Calls | Verified Date | Doc URL |',
    '|---|---|---|---|---|---|---|---|---|---|',
  ];

  for (const p of list) {
    const limits = p.rateLimits.freeTier
      ? `${p.rateLimits.freeTier.requestsPerMinute ? p.rateLimits.freeTier.requestsPerMinute + ' RPM' : ''} ${p.rateLimits.freeTier.requestsPerDay ? p.rateLimits.freeTier.requestsPerDay + ' RPD' : ''}`.trim() || 'Custom'
      : 'Paid Only';
    const trainPolicy = p.dataUsePolicy.trainsOnData;
    const discovery = p.discovery.supported ? `Yes (${p.discovery.endpoint})` : 'No';
    const tools = p.supportsToolCalls ? 'Yes' : 'No';

    lines.push(
      `| **${p.name}** | \`${p.type}\` | \`${p.baseUrl}\` | \`${p.authScheme}\` | ${limits} | \`${trainPolicy}\` | ${discovery} | ${tools} | ${p.verifiedAt} | [Docs](${p.documentationUrl}) |`
    );
  }

  const unverified = list.filter((p) => p.needsHumanVerification);
  lines.push('', '## NEEDS_HUMAN_VERIFICATION', '');
  if (unverified.length === 0) {
    lines.push('All day-one provider profiles have verified documentation and clear terms.');
  } else {
    lines.push('The following providers have unverified terms or pending legal confirmation:');
    for (const u of unverified) {
      lines.push(`- **${u.name}** (\`${u.id}\`): ${u.notes ?? 'Requires ToS review'}. Documented at [${u.documentationUrl}](${u.documentationUrl})`);
    }
  }

  return lines.join('\n');
}
