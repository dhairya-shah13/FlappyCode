import { USER_AGENT } from './user-agent.js';

export interface DetectedProvider {
  id: string; // 'ollama' | 'lmstudio' | 'llamacpp'
  type: string;
  displayName: string;
  baseUrl: string;
  reachable: boolean;
  modelsCount: number;
  modelNames: string[];
}

export interface DetectorOptions {
  timeoutMs?: number;
  signal?: AbortSignal;
  customPorts?: {
    ollama?: number;
    lmstudio?: number;
    llamacpp?: number;
  };
}

export class LocalProviderDetector {
  public static readonly DEFAULT_PORTS = {
    ollama: 11434,
    lmstudio: 1234,
    llamacpp: 8080,
  };

  /**
   * Probe Ollama local server (http://localhost:11434/api/tags).
   * Distinguishes between unreachable, reachable but empty, and reachable with models.
   */
  public static async probeOllama(
    port = LocalProviderDetector.DEFAULT_PORTS.ollama,
    timeoutMs = 1500,
    signal?: AbortSignal
  ): Promise<DetectedProvider | null> {
    const baseUrl = `http://localhost:${port}`;
    try {
      const timeoutSignal = AbortSignal.timeout(timeoutMs);
      const combinedSignal = signal ? AbortSignal.any([signal, timeoutSignal]) : timeoutSignal;

      const res = await fetch(`${baseUrl}/api/tags`, {
        headers: { 'User-Agent': USER_AGENT },
        signal: combinedSignal,
      });

      if (!res.ok) return null;

      const data = (await res.json()) as any;
      if (!data || !Array.isArray(data.models)) return null;

      const modelNames = data.models.map((m: any) => m.name || m.model || String(m)).filter(Boolean);
      return {
        id: 'ollama',
        type: 'ollama',
        displayName: 'Ollama (Local)',
        baseUrl,
        reachable: true,
        modelsCount: modelNames.length,
        modelNames,
      };
    } catch {
      return null;
    }
  }

  /**
   * Probe LM Studio local server (http://localhost:1234/v1/models).
   * OpenAI-compatible endpoint.
   */
  public static async probeLMStudio(
    port = LocalProviderDetector.DEFAULT_PORTS.lmstudio,
    timeoutMs = 1500,
    signal?: AbortSignal
  ): Promise<DetectedProvider | null> {
    const baseUrl = `http://localhost:${port}/v1`;
    try {
      const timeoutSignal = AbortSignal.timeout(timeoutMs);
      const combinedSignal = signal ? AbortSignal.any([signal, timeoutSignal]) : timeoutSignal;

      const res = await fetch(`${baseUrl}/models`, {
        headers: { 'User-Agent': USER_AGENT },
        signal: combinedSignal,
      });

      if (!res.ok) return null;

      const data = (await res.json()) as any;
      if (!data || !Array.isArray(data.data)) return null;

      const modelNames = data.data.map((m: any) => m.id || String(m)).filter(Boolean);
      return {
        id: 'lmstudio',
        type: 'openai-compatible',
        displayName: 'LM Studio (Local)',
        baseUrl,
        reachable: true,
        modelsCount: modelNames.length,
        modelNames,
      };
    } catch {
      return null;
    }
  }

  /**
   * Probe llama.cpp server (http://localhost:8080/v1/models or /health).
   */
  public static async probeLlamaCpp(
    port = LocalProviderDetector.DEFAULT_PORTS.llamacpp,
    timeoutMs = 1500,
    signal?: AbortSignal
  ): Promise<DetectedProvider | null> {
    const baseUrl = `http://localhost:${port}/v1`;
    try {
      const timeoutSignal = AbortSignal.timeout(timeoutMs);
      const combinedSignal = signal ? AbortSignal.any([signal, timeoutSignal]) : timeoutSignal;

      const res = await fetch(`${baseUrl}/models`, {
        headers: { 'User-Agent': USER_AGENT },
        signal: combinedSignal,
      });

      if (!res.ok) return null;

      const data = (await res.json()) as any;
      if (!data || !Array.isArray(data.data)) return null;

      const modelNames = data.data.map((m: any) => m.id || String(m)).filter(Boolean);
      return {
        id: 'llamacpp',
        type: 'openai-compatible',
        displayName: 'llama.cpp (Local)',
        baseUrl,
        reachable: true,
        modelsCount: modelNames.length,
        modelNames,
      };
    } catch {
      return null;
    }
  }

  /**
   * Concurrently probe all supported local providers with a bounded timeout.
   */
  public static async detectAll(opts: DetectorOptions = {}): Promise<DetectedProvider[]> {
    const timeout = opts.timeoutMs ?? 1500;
    const ports = opts.customPorts ?? {};

    const probes = [
      LocalProviderDetector.probeOllama(ports.ollama, timeout, opts.signal),
      LocalProviderDetector.probeLMStudio(ports.lmstudio, timeout, opts.signal),
      LocalProviderDetector.probeLlamaCpp(ports.llamacpp, timeout, opts.signal),
    ];

    const results = await Promise.allSettled(probes);
    const detected: DetectedProvider[] = [];

    for (const r of results) {
      if (r.status === 'fulfilled' && r.value !== null) {
        detected.push(r.value);
      }
    }

    return detected;
  }
}
