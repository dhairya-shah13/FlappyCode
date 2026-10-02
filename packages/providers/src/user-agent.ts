import { createRequire } from 'node:module';

/**
 * GAP-036 (PI-004): every connector must identify itself honestly as
 * `flappycode/<version>` — never disguised as another client, and never
 * hard-coded per site so versions cannot drift.
 *
 * The version is read from the nearest package.json at runtime (works both
 * from src/ in tests and from dist/ after tsup build).
 */
function readVersion(): string {
  try {
    const require = createRequire(import.meta.url);
    const pkg = require('../package.json') as { version?: string };
    if (pkg?.version) return pkg.version;
  } catch {
    // fall through to default
  }
  return '0.1.0';
}

export const FLAPPYCODE_VERSION: string = readVersion();

/** Honest User-Agent header value sent by all provider connectors. */
export const USER_AGENT = `flappycode/${FLAPPYCODE_VERSION}`;
