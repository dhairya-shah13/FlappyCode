import http from 'node:http';
import crypto from 'node:crypto';
import { FlappyEngine, FlappyError, ErrorCodes, formatErrorForHttp } from '@flappycode/core';
import { CommandSchema, FlappyEvent } from '@flappycode/protocol';

export interface ServerOptions {
  port?: number;
  host?: string;
  bearerToken?: string;
}

export class FlappyServer {
  private server: http.Server | null = null;
  public readonly port: number;
  public readonly host: string;
  public readonly bearerToken: string;

  constructor(
    private engine: FlappyEngine,
    options: ServerOptions = {}
  ) {
    this.port = options.port || 4477;
    // Strictly loopback by default per SRS & user directive 5
    this.host = options.host || '127.0.0.1';
    if (this.host !== '127.0.0.1' && this.host !== 'localhost') {
      throw new Error(`Security Violation: flappycode serve only permits loopback binding ('127.0.0.1').`);
    }
    this.bearerToken = options.bearerToken || `tok_${crypto.randomBytes(16).toString('hex')}`;
  }

  public start(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.server = http.createServer((req, res) => {
        this.handleRequest(req, res);
      });

      this.server.on('error', (err) => {
        reject(err);
      });

      this.server.listen(this.port, this.host, () => {
        resolve();
      });
    });
  }

  public stop(): Promise<void> {
    return new Promise((resolve) => {
      if (this.server) {
        this.server.close(() => resolve());
      } else {
        resolve();
      }
    });
  }

  private handleRequest(req: http.IncomingMessage, res: http.ServerResponse): void {
    const url = new URL(req.url || '/', `http://${this.host}:${this.port}`);

    // CORS is disabled by default per SRS NFR-SEC-003 and Section 28 of prompt
    // We intentionally do NOT set Access-Control-Allow-Origin: *

    // Public endpoints (health & openapi spec)
    if (req.method === 'GET' && url.pathname === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok', uptime: process.uptime() }));
      return;
    }

    if (req.method === 'GET' && url.pathname === '/openapi.json') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(this.getOpenApiSpec(), null, 2));
      return;
    }

    // Bearer token check
    const authHeader = req.headers['authorization'];
    if (!authHeader || authHeader !== `Bearer ${this.bearerToken}`) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Unauthorized: Valid Bearer token required' }));
      return;
    }

    if (req.method === 'GET' && url.pathname === '/v1/registry') {
      const models = this.engine.getModels();
      const freeCount = this.engine.getFreeModelsCount();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ total_models: models.length, free_models_available: freeCount, models }));
      return;
    }

    if (req.method === 'GET' && url.pathname === '/v1/events') {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      });

      const listener = (event: FlappyEvent) => {
        res.write(`data: ${JSON.stringify(event)}\n\n`);
      };

      const unsubscribe = this.engine.eventBus.onAny(listener);

      req.on('close', () => {
        unsubscribe();
      });
      return;
    }

    if (req.method === 'POST' && url.pathname === '/v1/commands') {
      let body = '';
      req.on('data', (chunk) => {
        body += chunk;
      });
      req.on('end', async () => {
        try {
          let json: any;
          try {
            json = JSON.parse(body);
          } catch {
            throw new FlappyError({
              code: ErrorCodes.COMMAND_INVALID,
              category: 'command',
              what: 'Invalid JSON request body.',
              next: 'Ensure the request body contains valid JSON.',
            });
          }

          const parsed = CommandSchema.safeParse(json);
          if (!parsed.success) {
            const issues = parsed.error.issues.map((i) => `${i.path.join('.') || 'body'}: ${i.message}`).join('; ');
            throw new FlappyError({
              code: ErrorCodes.COMMAND_INVALID,
              category: 'command',
              what: `Invalid command payload: ${issues}`,
              next: 'Check command payload schema.',
            });
          }

          const cmd = parsed.data;

          if (cmd.type === 'submitPrompt') {
            const plan = await this.engine.submitPrompt(cmd.prompt);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true, plan }));
          } else if (cmd.type === 'approvePlan') {
            this.engine.approvePlan(cmd.run_id);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true }));
          } else if (cmd.type === 'rejectPlan') {
            this.engine.rejectPlan(cmd.run_id, cmd.reason);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true }));
          } else if (cmd.type === 'executePlan') {
            const plan = this.engine.orchestrator.getPendingPlan(cmd.run_id);
            if (!plan) {
              throw new FlappyError({
                code: ErrorCodes.RUN_NOT_FOUND,
                category: 'command',
                what: `No pending plan found for run '${cmd.run_id}'.`,
                next: 'Submit a prompt first to generate a plan.',
              });
            }
            this.engine.executePlan(cmd.run_id).catch(() => {});
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true, run_id: cmd.run_id }));
          } else if (cmd.type === 'approveDiff') {
            this.engine.approveDiff(cmd.run_id);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true }));
          } else if (cmd.type === 'rejectDiff') {
            this.engine.rejectDiff(cmd.run_id, cmd.reason);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true }));
          } else if (cmd.type === 'answerQuestion') {
            const ok = this.engine.answerQuestion(cmd.question_id, cmd.answer);
            if (!ok) {
              throw new FlappyError({
                code: ErrorCodes.INVALID_STATE,
                category: 'command',
                what: `No pending question '${cmd.question_id}'.`,
                next: 'Verify the question_id or check active questions.',
              });
            }
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true }));
          } else if (cmd.type === 'grantPermission') {
            const decision: 'allow' | 'always' | 'deny' = cmd.always_allow
              ? 'always'
              : (cmd.approved ? 'allow' : 'deny');
            this.engine.grantPermission(cmd.permission_id, decision);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true }));
          } else if (cmd.type === 'resolvePoolExhausted') {
            const result = await this.engine.resolvePoolExhausted(
              cmd.run_id,
              cmd.action,
              { confirm: cmd.confirm, modelId: cmd.paid_model_id }
            );
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true, ...result }));
          } else if (cmd.type === 'setModelOverride') {
            const result = this.engine.setModelOverride(cmd.model_id, cmd.tier);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true, ...result }));
          } else if (cmd.type === 'deleteModelOverride') {
            const result = this.engine.deleteModelOverride(cmd.model_id);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true, ...result }));
          } else if (cmd.type === 'cancelRun') {
            this.engine.cancelRun(cmd.run_id);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true }));
          } else if (cmd.type === 'addProvider') {
            const models = await this.engine.addProvider(cmd.provider, cmd.api_key);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true, models }));
          } else if (cmd.type === 'refreshProviders') {
            await this.engine.refreshProviders();
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true }));
          } else if (cmd.type === 'pinModel') {
            this.engine.bindAgent(cmd.agent_name, cmd.model_id);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true }));
          } else {
            throw new FlappyError({
              code: ErrorCodes.COMMAND_UNSUPPORTED,
              category: 'command',
              what: `Command '${(cmd as any).type}' is not supported.`,
              next: 'Review supported commands in /openapi.json.',
            });
          }
        } catch (err: any) {
          const { status, body: errBody } = formatErrorForHttp(err);
          res.writeHead(status, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(errBody));
        }
      });
      return;
    }

    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found' }));
  }

  private getOpenApiSpec(): Record<string, any> {
    return {
      openapi: '3.0.0',
      info: {
        title: 'FlappyCode Local Server API',
        version: '0.1.0',
        description: 'Local loopback HTTP/SSE server for FlappyCode core engine',
      },
      paths: {
        '/v1/commands': {
          post: {
            summary: 'Submit a typed command to the core engine',
            responses: { '200': { description: 'Command accepted' } },
          },
        },
        '/v1/events': {
          get: {
            summary: 'SSE stream of engine protocol events',
            responses: { '200': { description: 'Event stream' } },
          },
        },
        '/v1/registry': {
          get: {
            summary: 'Get model registry pool and free model counts',
            responses: { '200': { description: 'Registry data' } },
          },
        },
      },
    };
  }
}
