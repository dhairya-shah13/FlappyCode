import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  FlappyEngine,
  LspClient,
  McpClient,
  BrowserController,
  CapabilityProbe,
  DeterministicRouter,
  ModelRegistry,
  FlappyEventBus,
} from '@flappycode/core';
import {
  FlappyDatabase,
  HybridSecretStore,
  ModelRepository,
  ProviderRepository,
} from '@flappycode/storage';
import { CompletionChunk, CompletionRequest, HealthInfo, ProviderConnector } from '@flappycode/providers';
import { ProviderConfig, RawModel } from '@flappycode/protocol';

class SimulationConnector implements ProviderConnector {
  public type = 'mock';

  async authenticate() {
    return { success: true };
  }

  async listModels(): Promise<RawModel[]> {
    return [];
  }

  async healthCheck(): Promise<HealthInfo> {
    return { status: 'healthy', latencyMs: 5, lastChecked: Date.now() };
  }

  async *complete(
    cfg: ProviderConfig,
    req: CompletionRequest,
    _apiKey?: string
  ): AsyncIterable<CompletionChunk> {
    void cfg;
    // Capability probe round-trip check
    if (req.tools && req.tools.length > 0 && req.messages[0]?.content?.includes('test_probe_tool')) {
      if (req.model === 'sim-broken-tools') {
        yield { delta: 'I do not support tools.' };
        return;
      }
      yield {
        delta: '',
        tool_calls: [
          {
            index: 0,
            id: 'call_1',
            type: 'function' as const,
            function: { name: 'test_probe_tool', arguments: '{"ping":"pong"}' },
          },
        ],
      };
      return;
    }

    yield { delta: `Completed by ${req.model}` };
  }
}

describe('Stage F End-to-End Simulations (F-01 through F-07)', () => {
  let tempDir: string;
  let httpServer: http.Server;
  let httpPort: number;

  beforeEach(async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'flappy-stage-f-sim-'));

    httpServer = http.createServer((req, res) => {
      if (req.url === '/page') {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end('<html><head><title>Simulation</title></head><body><h1>Sim Page</h1></body></html>');
      } else {
        res.writeHead(404);
        res.end();
      }
    });

    await new Promise<void>((resolve) => {
      httpServer.listen(0, '127.0.0.1', () => {
        httpPort = (httpServer.address() as any).port;
        resolve();
      });
    });
  });

  afterEach(async () => {
    await new Promise((r) => httpServer.close(r));
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {}
  });

  it('Simulation F-01: Capability probe PASS model is selected, FAIL model is excluded', async () => {
    const probe = new CapabilityProbe();
    const conn = new SimulationConnector();
    const cfg: ProviderConfig = {
      id: 'prov',
      display_name: 'P',
      type: 'mock',
      enabled: true,
      data_use_policy: 'no_training',
    };

    // Broken model fails
    const passBroken = await probe.probeToolCalling(conn, cfg, 'sim-broken-tools');
    expect(passBroken).toBe(false);

    // Working model passes
    const passGood = await probe.probeToolCalling(conn, cfg, 'sim-good-tools');
    expect(passGood).toBe(true);
  });

  it('Simulation F-02: LSP receives intentional type error and clears on corrective edit', async () => {
    const lsp = new LspClient();
    const fixturePath = path.resolve(__dirname, '../fixtures/lsp-server.cjs');
    lsp.registerLanguageServer('typescript', {
      command: 'node',
      args: [fixturePath],
    });

    const file = path.join(tempDir, 'sample.ts');
    const badCode = 'const x: number = "string"; // intentional_type_error';
    fs.writeFileSync(file, badCode, 'utf8');

    await lsp.notifyChange(file, badCode, tempDir);
    await new Promise((r) => setTimeout(r, 300));

    const diags = await lsp.getDiagnostics(tempDir, file);
    expect(diags.length).toBe(1);
    expect(diags[0].severity).toBe('error');
    expect(diags[0].message).toContain("Type 'string' is not assignable to type 'number'");

    // Corrective edit
    const fixedCode = 'const x: number = 100;';
    fs.writeFileSync(file, fixedCode, 'utf8');
    await lsp.notifyChange(file, fixedCode, tempDir);
    await new Promise((r) => setTimeout(r, 300));

    const clearedDiags = await lsp.getDiagnostics(tempDir, file);
    expect(clearedDiags.length).toBe(0);

    await lsp.shutdown();
  });

  it('Simulation F-03: LSP server unavailable/crashes with controlled timeout and no hang', async () => {
    const lsp = new LspClient();
    const fixturePath = path.resolve(__dirname, '../fixtures/lsp-server.cjs');
    lsp.registerLanguageServer('typescript', {
      command: 'node',
      args: [fixturePath, '--crash-on-open'],
    });

    const file = path.join(tempDir, 'crash.ts');
    await lsp.notifyChange(file, 'const a = 1;', tempDir);
    await new Promise((r) => setTimeout(r, 300));

    expect(lsp.isAvailable('typescript')).toBe(false);
    expect(await lsp.getDiagnostics(tempDir, file)).toEqual([]);

    await lsp.shutdown();
  });

  it('Simulation F-04: MCP fixture server initialize, discover tool, permission gate, invoke, result', async () => {
    const mcp = new McpClient();
    const fixturePath = path.resolve(__dirname, '../fixtures/mcp-server.cjs');
    mcp.registerServer({
      name: 'fixture_mcp',
      command: 'node',
      args: [fixturePath],
      permissionTier: 'execute',
    });

    const tools = await mcp.listTools();
    expect(tools.length).toBe(2);

    // Permission approval and invocation
    let checkedTier = '';
    const res = await mcp.callTool(
      'mcp__fixture_mcp__calculate_tool',
      { a: 20, b: 22 },
      async (meta) => {
        checkedTier = meta.permissionTier;
        return true;
      }
    );

    expect(checkedTier).toBe('execute');
    expect(res).toBe('result: 42');

    await mcp.shutdown();
  });

  it('Simulation F-05: MCP server crash/timeout returns controlled error and cleanup', async () => {
    const mcp = new McpClient();
    const fixturePath = path.resolve(__dirname, '../fixtures/mcp-server.cjs');
    mcp.registerServer({
      name: 'crash_mcp',
      command: 'node',
      args: [fixturePath, '--crash-on-call'],
    });

    await mcp.listTools();
    await expect(
      mcp.callTool('mcp__crash_mcp__echo_tool', { message: 'hello' })
    ).rejects.toThrow();

    expect(mcp.isAvailable('crash_mcp')).toBe(false);
    await mcp.shutdown();
  });

  it('Simulation F-06: Browser fixture page launch, navigate, extract, screenshot, cleanup', async () => {
    const browser = new BrowserController();
    await browser.launch();

    const pageUrl = `http://127.0.0.1:${httpPort}/page`;
    await browser.navigate(pageUrl);

    const content = await browser.extractContent();
    expect(content.title).toBe('Simulation');
    expect(content.text).toContain('Sim Page');

    const shotFile = path.join(tempDir, 'sim-shot.png');
    const shot = await browser.captureScreenshot(shotFile);
    expect(shot.base64.length).toBeGreaterThan(0);
    expect(fs.existsSync(shotFile)).toBe(true);

    await browser.close();
  });

  it('Simulation F-07: Vision model succeeds, non-vision model is excluded honestly', () => {
    const db = new FlappyDatabase({ path: path.join(tempDir, 'f07.db') });
    const bus = new FlappyEventBus();
    const modelRepo = new ModelRepository(db.db);
    const provRepo = new ProviderRepository(db.db);
    const secrets = new HybridSecretStore(path.join(tempDir, 's.enc'));
    const registry = new ModelRegistry(provRepo, modelRepo, secrets, bus);

    provRepo.save({
      id: 'mock-p',
      display_name: 'Mock',
      type: 'mock',
      enabled: true,
      data_use_policy: 'no_training',
    });

    modelRepo.saveModel({
      provider_id: 'mock-p',
      model_id: 'vision-yes',
      tier: 'free',
      tier_source: 'metadata',
      context_length: 8000,
      modality: 'multimodal',
      supports_tools: false,
      supports_vision: true,
      tool_probe_passed: null,
      price_in: 0,
      price_out: 0,
      avg_latency_ms: 100,
      last_validated_at: Date.now(),
      data_use_policy: 'no_training',
      is_local: false,
      is_pinned: false,
    });

    modelRepo.saveModel({
      provider_id: 'mock-p',
      model_id: 'vision-no',
      tier: 'free',
      tier_source: 'metadata',
      context_length: 8000,
      modality: 'text',
      supports_tools: false,
      supports_vision: false,
      tool_probe_passed: null,
      price_in: 0,
      price_out: 0,
      avg_latency_ms: 50,
      last_validated_at: Date.now(),
      data_use_policy: 'no_training',
      is_local: false,
      is_pinned: false,
    });

    const router = new DeterministicRouter(registry, bus);

    // Request requires vision -> only vision-yes is eligible
    const route = router.select({ taskType: 'coding', minContext: 4000, vision: true });
    expect('selected' in route).toBe(true);
    if ('selected' in route) {
      expect(route.selected.model_id).toBe('vision-yes');
    }

    db.close();
  });
});
