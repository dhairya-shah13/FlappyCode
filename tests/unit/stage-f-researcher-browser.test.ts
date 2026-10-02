import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  ResearcherService,
  BrowserController,
  ToolRegistry,
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

describe('GAP-038: Researcher, Browser & Vision Capabilities', () => {
  let server: http.Server;
  let serverPort: number;
  let tempDir: string;

  beforeEach(async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'flappy-gap038-test-'));

    // Local HTTP server for deterministic research and browser tests
    server = http.createServer((req, res) => {
      if (req.url === '/article') {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(`
          <!DOCTYPE html>
          <html>
            <head><title>Research Article</title></head>
            <body>
              <h1>Article Heading</h1>
              <p>This is reference text for the agent.</p>
              <script>alert("ignore script");</script>
            </body>
          </html>
        `);
      } else if (req.url === '/large') {
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.end('A'.repeat(20000));
      } else if (req.url === '/hang') {
        // do not respond
      } else {
        res.writeHead(404);
        res.end('Not found');
      }
    });

    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => {
        const addr = server.address() as any;
        serverPort = addr.port;
        resolve();
      });
    });
  });

  afterEach(async () => {
    await new Promise((r) => server.close(r));
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  describe('ResearcherService', () => {
    it('fetches URL, extracts text, bounds length, and wraps in untrusted markers', async () => {
      const researcher = new ResearcherService({ maxChars: 500 });
      const result = await researcher.fetchUrl(`http://127.0.0.1:${serverPort}/article`);

      expect(result.status).toBe(200);
      expect(result.title).toBe('Research Article');
      expect(result.content).toContain('<<<UNTRUSTED EXTERNAL WEB CONTENT');
      expect(result.content).toContain('Article Heading');
      expect(result.content).toContain('This is reference text for the agent');
      expect(result.content).not.toContain('<script>');
      expect(result.content).toContain('<<<END UNTRUSTED EXTERNAL WEB CONTENT>>>');
    });

    it('bounds content exceeding maxChars cap', async () => {
      const researcher = new ResearcherService({ maxChars: 100 });
      const result = await researcher.fetchUrl(`http://127.0.0.1:${serverPort}/large`);

      expect(result.content).toContain('...[Content bounded by researcher context cap]');
    });

    it('handles timeouts and 404 errors safely', async () => {
      const researcher = new ResearcherService({ timeoutMs: 300 });
      await expect(
        researcher.fetchUrl(`http://127.0.0.1:${serverPort}/hang`)
      ).rejects.toThrow('timed out');

      await expect(
        researcher.fetchUrl(`http://127.0.0.1:${serverPort}/missing`)
      ).rejects.toThrow('HTTP fetch failed with status 404');
    });
  });

  describe('BrowserController', () => {
    it('supports launch, navigate, extract, screenshot, and close lifecycle', async () => {
      const browser = new BrowserController();
      await browser.launch();

      const url = `http://127.0.0.1:${serverPort}/article`;
      await browser.navigate(url);

      const content = await browser.extractContent();
      expect(content.url).toBe(url);
      expect(content.title).toBe('Research Article');
      expect(content.text).toContain('Article Heading');

      const screenshotFile = path.join(tempDir, 'shot.png');
      const shot = await browser.captureScreenshot(screenshotFile);
      expect(shot.base64.length).toBeGreaterThan(0);
      expect(shot.width).toBe(1280);
      expect(shot.height).toBe(800);
      expect(fs.existsSync(screenshotFile)).toBe(true);

      await browser.close();
    });
  });

  describe('Vision Capability Routing', () => {
    it('router respects vision capability constraint honestly', () => {
      const db = new FlappyDatabase({ path: path.join(tempDir, 'vision.db') });
      const eventBus = new FlappyEventBus();
      const modelRepo = new ModelRepository(db.db);
      const providerRepo = new ProviderRepository(db.db);
      const secretStore = new HybridSecretStore(path.join(tempDir, 'sec.enc'));
      const registry = new ModelRegistry(providerRepo, modelRepo, secretStore, eventBus);

      providerRepo.save({
        id: 'p1',
        display_name: 'P1',
        type: 'mock',
        enabled: true,
        data_use_policy: 'no_training',
      });

      // Model 1: No vision
      modelRepo.saveModel({
        provider_id: 'p1',
        model_id: 'text-only-model',
        tier: 'free',
        tier_source: 'metadata',
        context_length: 8000,
        modality: 'text',
        supports_tools: false,
        supports_vision: false,
        tool_probe_passed: null,
        price_in: 0,
        price_out: 0,
        avg_latency_ms: 100,
        last_validated_at: Date.now(),
        data_use_policy: 'no_training',
        is_local: false,
        is_pinned: false,
      });

      // Model 2: Supports vision
      modelRepo.saveModel({
        provider_id: 'p1',
        model_id: 'vision-model',
        tier: 'free',
        tier_source: 'metadata',
        context_length: 8000,
        modality: 'multimodal',
        supports_tools: false,
        supports_vision: true,
        tool_probe_passed: null,
        price_in: 0,
        price_out: 0,
        avg_latency_ms: 200,
        last_validated_at: Date.now(),
        data_use_policy: 'no_training',
        is_local: false,
        is_pinned: false,
      });

      const router = new DeterministicRouter(registry, eventBus);

      // Request without vision -> selects text-only (lower latency)
      const resText = router.select({ taskType: 'coding', minContext: 4000, vision: false });
      expect('selected' in resText).toBe(true);
      if ('selected' in resText) {
        expect(resText.selected.model_id).toBe('text-only-model');
      }

      // Request with vision -> excludes text-only model, selects vision model
      const resVision = router.select({ taskType: 'coding', minContext: 4000, vision: true });
      expect('selected' in resVision).toBe(true);
      if ('selected' in resVision) {
        expect(resVision.selected.model_id).toBe('vision-model');
      }

      db.close();
    });
  });

  describe('ToolRegistry', () => {
    it('registers dynamic tools, validates schemas, lists definitions, and checks permissions', async () => {
      const registry = new ToolRegistry();

      registry.registerTool({
        definition: {
          type: 'function',
          function: {
            name: 'custom_search',
            description: 'Custom search utility',
            parameters: {
              type: 'object',
              properties: { q: { type: 'string' } },
              required: ['q'],
            },
          },
        },
        permissionTier: 'read',
        handler: async (args) => `Search results for ${args.q}`,
      });

      const tools = registry.listToolDefinitions();
      expect(tools.length).toBe(1);
      expect(tools[0].function.name).toBe('custom_search');

      // Permission check approved
      const res = await registry.executeTool(
        'custom_search',
        { q: 'flappy' },
        async (tier) => tier === 'read'
      );
      expect(res).toBe('Search results for flappy');

      // Permission check denied
      await expect(
        registry.executeTool('custom_search', { q: 'blocked' }, async () => false)
      ).rejects.toThrow('Permission denied');

      // Unregister
      registry.unregisterTool('custom_search');
      expect(registry.listToolDefinitions().length).toBe(0);
    });
  });
});
