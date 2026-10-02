/**
 * Upgrade checker for FlappyCode CLI
 * Implements NFR-PRV-001 (disableable, privacy-safe, no telemetry)
 * and CLIDesign.md §5.1 (graceful offline/not-found handling).
 */

export interface UpgradeCheckOptions {
  currentVersion: string;
  registryUrl?: string;
  timeoutMs?: number;
  enabled?: boolean;
}

export interface UpgradeCheckResult {
  status: 'up_to_date' | 'update_available' | 'disabled' | 'error';
  currentVersion: string;
  latestVersion?: string;
  message: string;
  error?: string;
}

export function compareSemver(a: string, b: string): number {
  const parse = (v: string) =>
    v
      .replace(/^v/, '')
      .split(/[-+]/)[0]
      .split('.')
      .map((x) => parseInt(x, 10) || 0);

  const pa = parse(a);
  const pb = parse(b);

  for (let i = 0; i < 3; i++) {
    const na = pa[i] ?? 0;
    const nb = pb[i] ?? 0;
    if (na > nb) return 1;
    if (na < nb) return -1;
  }
  return 0;
}

export async function checkUpgrade(options: UpgradeCheckOptions): Promise<UpgradeCheckResult> {
  const {
    currentVersion,
    registryUrl = 'https://registry.npmjs.org/flappycode/latest',
    timeoutMs = 3000,
    enabled = true,
  } = options;

  if (!enabled) {
    return {
      status: 'disabled',
      currentVersion,
      message: 'Update checks are disabled by configuration.',
    };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(registryUrl, {
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
        'User-Agent': `flappycode/${currentVersion}`,
      },
    });

    clearTimeout(timer);

    if (!res.ok) {
      if (res.status === 404) {
        return {
          status: 'error',
          currentVersion,
          message: `Package 'flappycode' was not found on the registry (${registryUrl}).`,
          error: 'Package not found (404)',
        };
      }
      return {
        status: 'error',
        currentVersion,
        message: `Registry returned HTTP ${res.status}: ${res.statusText}`,
        error: `HTTP ${res.status}`,
      };
    }

    const data = (await res.json()) as any;
    const latestVersion = data.version;
    if (!latestVersion) {
      return {
        status: 'error',
        currentVersion,
        message: 'Registry response did not contain a valid version field.',
        error: 'Invalid response format',
      };
    }

    const cmp = compareSemver(latestVersion, currentVersion);
    if (cmp > 0) {
      return {
        status: 'update_available',
        currentVersion,
        latestVersion,
        message: `A new version of flappycode is available: ${latestVersion} (current: ${currentVersion})`,
      };
    }

    return {
      status: 'up_to_date',
      currentVersion,
      latestVersion,
      message: `flappycode is up to date (${currentVersion}).`,
    };
  } catch (err: any) {
    clearTimeout(timer);
    const isTimeout = err?.name === 'AbortError';
    return {
      status: 'error',
      currentVersion,
      message: isTimeout
        ? 'Update check timed out after 3000ms.'
        : `Network error checking for updates: ${err?.message || 'offline'}`,
      error: err?.message || 'Unknown network error',
    };
  }
}
