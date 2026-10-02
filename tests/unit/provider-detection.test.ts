import { describe, it, expect, afterAll } from 'vitest';
import http from 'node:http';
import { LocalProviderDetector } from '@flappycode/providers';

describe('Local Provider Auto-Detection (GAP-040)', () => {
  const servers: http.Server[] = [];

  afterAll(async () => {
    for (const s of servers) {
      await new Promise<void>((resolve) => s.close(() => resolve()));
    }
  });

  const startMockServer = (
    handler: (req: http.IncomingMessage, res: http.ServerResponse) => void
  ): Promise<number> => {
    return new Promise((resolve) => {
      const server = http.createServer(handler);
      server.listen(0, '127.0.0.1', () => {
        const address = server.address() as any;
        servers.push(server);
        resolve(address.port);
      });
    });
  };

  it('detects a running Ollama server with discovered models', async () => {
    const port = await startMockServer((req, res) => {
      if (req.url === '/api/tags') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            models: [
              { name: 'llama3:8b', modified_at: '2026-01-01T00:00:00Z', size: 4000000 },
              { name: 'qwen2.5-coder:7b', modified_at: '2026-01-01T00:00:00Z', size: 4500000 },
            ],
          })
        );
      } else {
        res.writeHead(404);
        res.end();
      }
    });

    const detected = await LocalProviderDetector.probeOllama(port, 2000);
    expect(detected).not.toBeNull();
    expect(detected?.id).toBe('ollama');
    expect(detected?.type).toBe('ollama');
    expect(detected?.reachable).toBe(true);
    expect(detected?.modelsCount).toBe(2);
    expect(detected?.modelNames).toEqual(['llama3:8b', 'qwen2.5-coder:7b']);
  });

  it('detects a running LM Studio server with models', async () => {
    const port = await startMockServer((req, res) => {
      if (req.url === '/v1/models') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            data: [{ id: 'qwen2.5-coder-7b-instruct' }, { id: 'deepseek-coder-6.7b' }],
          })
        );
      } else {
        res.writeHead(404);
        res.end();
      }
    });

    const detected = await LocalProviderDetector.probeLMStudio(port, 2000);
    expect(detected).not.toBeNull();
    expect(detected?.id).toBe('lmstudio');
    expect(detected?.reachable).toBe(true);
    expect(detected?.modelsCount).toBe(2);
    expect(detected?.modelNames).toEqual(['qwen2.5-coder-7b-instruct', 'deepseek-coder-6.7b']);
  });

  it('detects a running llama.cpp server with models', async () => {
    const port = await startMockServer((req, res) => {
      if (req.url === '/v1/models') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            data: [{ id: 'mistral-7b-instruct-v0.3' }],
          })
        );
      } else {
        res.writeHead(404);
        res.end();
      }
    });

    const detected = await LocalProviderDetector.probeLlamaCpp(port, 2000);
    expect(detected).not.toBeNull();
    expect(detected?.id).toBe('llamacpp');
    expect(detected?.reachable).toBe(true);
    expect(detected?.modelsCount).toBe(1);
    expect(detected?.modelNames).toEqual(['mistral-7b-instruct-v0.3']);
  });

  it('rejects false positives when endpoint returns non-JSON or HTML 404', async () => {
    const port = await startMockServer((_req, res) => {
      res.writeHead(404, { 'Content-Type': 'text/html' });
      res.end('<html><body>Not Found</body></html>');
    });

    const ollama = await LocalProviderDetector.probeOllama(port, 1000);
    const lmstudio = await LocalProviderDetector.probeLMStudio(port, 1000);
    const llamacpp = await LocalProviderDetector.probeLlamaCpp(port, 1000);

    expect(ollama).toBeNull();
    expect(lmstudio).toBeNull();
    expect(llamacpp).toBeNull();
  });

  it('detectAll concurrently returns all active local servers', async () => {
    const ollamaPort = await startMockServer((req, res) => {
      if (req.url === '/api/tags') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ models: [{ name: 'phi3:mini' }] }));
      }
    });

    const lmstudioPort = await startMockServer((req, res) => {
      if (req.url === '/v1/models') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ data: [{ id: 'gemma-2-9b' }] }));
      }
    });

    // Unused port for llamacpp
    const deadPort = 59998;

    const detected = await LocalProviderDetector.detectAll({
      timeoutMs: 1500,
      customPorts: {
        ollama: ollamaPort,
        lmstudio: lmstudioPort,
        llamacpp: deadPort,
      },
    });

    expect(detected.length).toBe(2);
    expect(detected.map((d) => d.id).sort()).toEqual(['lmstudio', 'ollama']);
  });
});
