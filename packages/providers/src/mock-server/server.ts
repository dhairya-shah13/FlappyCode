import http, { IncomingHttpHeaders, Server } from 'node:http';
import { AddressInfo } from 'node:net';
import { ScenarioAction } from '../mock/dsl.js';

export interface RecordedServerRequest {
  method: string;
  url: string;
  headers: IncomingHttpHeaders;
  body: unknown;
  rawBody: string;
  timestamp: number;
}

export class MockOpenAIServer {
  private server: Server | null = null;
  private actions: ScenarioAction[] = [];
  public recordedRequests: RecordedServerRequest[] = [];
  public models = [
    { id: 'gpt-4o-mini', object: 'model', created: 1700000000, owned_by: 'openai' },
    { id: 'llama-3.3-70b', object: 'model', created: 1700000000, owned_by: 'meta' },
  ];

  constructor(initialActions: ScenarioAction[] = []) {
    this.actions = [...initialActions];
  }

  queueActions(...actions: ScenarioAction[]): void {
    this.actions.push(...actions);
  }

  clearRequests(): void {
    this.recordedRequests = [];
  }

  async start(): Promise<string> {
    return new Promise((resolve, reject) => {
      this.server = http.createServer((req, res) => {
        let rawBody = '';
        req.on('data', (chunk) => {
          rawBody += chunk.toString();
        });

        req.on('end', () => {
          let parsedBody: unknown = undefined;
          if (rawBody.trim()) {
            try {
              parsedBody = JSON.parse(rawBody);
            } catch {
              parsedBody = rawBody;
            }
          }

          this.recordedRequests.push({
            method: req.method ?? 'GET',
            url: req.url ?? '/',
            headers: req.headers,
            body: parsedBody,
            rawBody,
            timestamp: Date.now(),
          });

          this.handleRequest(req, res, parsedBody);
        });
      });

      this.server.on('error', reject);

      this.server.listen(0, '127.0.0.1', () => {
        const addr = this.server?.address() as AddressInfo;
        resolve(`http://127.0.0.1:${addr.port}/v1`);
      });
    });
  }

  async stop(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.server) {
        resolve();
        return;
      }
      this.server.close((err) => {
        if (err) reject(err);
        else resolve();
      });
      this.server = null;
    });
  }

  private handleRequest(
    req: http.IncomingMessage,
    res: http.ServerResponse,
    body: unknown,
  ): void {
    const url = req.url ?? '';

    // Check next queued action first
    const action = this.actions.shift();

    if (action) {
      if (action.type === 'authFail') {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: { message: action.message ?? 'Invalid API key', type: 'invalid_request_error', code: 'invalid_api_key' } }));
        return;
      }
      if (action.type === 'rateLimit') {
        const retrySecs = Math.ceil((action.retryAfterMs ?? 60000) / 1000);
        res.writeHead(429, {
          'Content-Type': 'application/json',
          'Retry-After': String(retrySecs),
        });
        res.end(JSON.stringify({ error: { message: 'Rate limit reached', type: 'rate_limit_error', code: 'rate_limit_exceeded' } }));
        return;
      }
      if (action.type === 'http5xx') {
        res.writeHead(action.status ?? 500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: { message: action.details ?? 'Internal Server Error' } }));
        return;
      }
      if (action.type === 'malformedJson') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(action.text ?? '{"broken": json');
        return;
      }
    }

    // Standard routing
    if (url.endsWith('/models') || url.includes('/models?')) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ object: 'list', data: this.models }));
      return;
    }

    if (url.endsWith('/chat/completions')) {
      const isStream =
        body && typeof body === 'object' && 'stream' in body && Boolean((body as { stream: unknown }).stream);

      if (action && action.type === 'okToolCall') {
        const argsStr =
          typeof action.args === 'string' ? action.args : JSON.stringify(action.args);

        if (isStream) {
          res.writeHead(200, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            Connection: 'keep-alive',
          });

          // Emit tool call chunk
          const chunk1 = {
            id: 'chatcmpl-mock-tool',
            object: 'chat.completion.chunk',
            created: Math.floor(Date.now() / 1000),
            model: 'mock-model',
            choices: [
              {
                index: 0,
                delta: {
                  role: 'assistant',
                  tool_calls: [
                    {
                      index: 0,
                      id: 'call_123',
                      type: 'function',
                      function: { name: action.name, arguments: argsStr },
                    },
                  ],
                },
                finish_reason: null,
              },
            ],
          };
          res.write(`data: ${JSON.stringify(chunk1)}\n\n`);

          const chunk2 = {
            id: 'chatcmpl-mock-tool',
            object: 'chat.completion.chunk',
            created: Math.floor(Date.now() / 1000),
            model: 'mock-model',
            choices: [{ index: 0, delta: {}, finish_reason: 'tool_calls' }],
          };
          res.write(`data: ${JSON.stringify(chunk2)}\n\n`);
          res.write('data: [DONE]\n\n');
          res.end();
          return;
        } else {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(
            JSON.stringify({
              id: 'chatcmpl-mock',
              object: 'chat.completion',
              choices: [
                {
                  index: 0,
                  message: {
                    role: 'assistant',
                    content: null,
                    tool_calls: [
                      {
                        id: 'call_123',
                        type: 'function',
                        function: { name: action.name, arguments: argsStr },
                      },
                    ],
                  },
                  finish_reason: 'tool_calls',
                },
              ],
            }),
          );
          return;
        }
      }

      const responseText = action && action.type === 'ok' ? action.text : 'Mock OpenAI completion';

      if (isStream) {
        res.writeHead(200, {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          Connection: 'keep-alive',
        });

        const words = responseText.split(' ');
        for (let i = 0; i < words.length; i++) {
          const deltaChunk = {
            id: 'chatcmpl-mock',
            object: 'chat.completion.chunk',
            created: Math.floor(Date.now() / 1000),
            model: 'mock-model',
            choices: [
              {
                index: 0,
                delta: { content: words[i] + (i < words.length - 1 ? ' ' : '') },
                finish_reason: null,
              },
            ],
          };
          res.write(`data: ${JSON.stringify(deltaChunk)}\n\n`);
        }

        const finishChunk = {
          id: 'chatcmpl-mock',
          object: 'chat.completion.chunk',
          created: Math.floor(Date.now() / 1000),
          model: 'mock-model',
          choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
          usage: { prompt_tokens: 10, completion_tokens: words.length, total_tokens: 10 + words.length },
        };
        res.write(`data: ${JSON.stringify(finishChunk)}\n\n`);
        res.write('data: [DONE]\n\n');
        res.end();
        return;
      } else {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            id: 'chatcmpl-mock',
            object: 'chat.completion',
            created: Math.floor(Date.now() / 1000),
            choices: [
              {
                index: 0,
                message: { role: 'assistant', content: responseText },
                finish_reason: 'stop',
              },
            ],
            usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
          }),
        );
        return;
      }
    }

    // Default 404
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: { message: `Not found: ${url}` } }));
  }
}
