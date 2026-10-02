import http from 'node:http';

export interface RecordedContractServer {
  server: http.Server;
  baseUrl: string;
  receivedRequests: Array<{
    method: string;
    url: string;
    headers: http.IncomingHttpHeaders;
    body: any;
  }>;
  close: () => Promise<void>;
}

export async function startContractFixtureServer(): Promise<RecordedContractServer> {
  const receivedRequests: RecordedContractServer['receivedRequests'] = [];

  const server = http.createServer(async (req, res) => {
    let rawBody = '';
    for await (const chunk of req) {
      rawBody += chunk;
    }

    let parsedBody: any = rawBody;
    try {
      parsedBody = JSON.parse(rawBody);
    } catch {}

    const reqRecord = {
      method: req.method || 'GET',
      url: req.url || '/',
      headers: req.headers,
      body: parsedBody,
    };
    receivedRequests.push(reqRecord);

    const url = req.url || '';

    // Error simulation paths
    if (url.includes('/error-400')) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: { message: 'Bad Request / Invalid API key' } }));
      return;
    }
    if (url.includes('/error-401')) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: { message: 'Invalid API key or unauthorized' } }));
      return;
    }
    if (url.includes('/error-403')) {
      res.writeHead(403, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: { message: 'Forbidden / Invalid API key' } }));
      return;
    }
    if (url.includes('/error-429')) {
      res.writeHead(429, {
        'Content-Type': 'application/json',
        'Retry-After': '5',
      });
      res.end(JSON.stringify({ error: { message: 'Rate limit exceeded' } }));
      return;
    }
    if (url.includes('/error-500')) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: { message: 'Internal Server Error' } }));
      return;
    }
    if (url.includes('/malformed-json')) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end('INVALID_NOT_JSON');
      return;
    }

    // 2. ANTHROPIC
    if (
      (req.headers['anthropic-version'] || req.headers['x-api-key']) &&
      req.method === 'GET' &&
      url.includes('/models')
    ) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          data: [
            {
              id: 'claude-3-5-sonnet-20241022',
              display_name: 'Claude 3.5 Sonnet',
              created_at: 1729000000,
            },
          ],
        })
      );
      return;
    }

    if (url.includes('/messages') && req.method === 'POST') {
      const isToolReq = parsedBody?.tools && parsedBody.tools.length > 0;
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      });

      res.write(
        `event: message_start\ndata: ${JSON.stringify({
          type: 'message_start',
          message: { id: 'msg_1', usage: { input_tokens: 30 } },
        })}\n\n`
      );

      if (isToolReq) {
        res.write(
          `event: content_block_start\ndata: ${JSON.stringify({
            type: 'content_block_start',
            index: 0,
            content_block: {
              type: 'tool_use',
              id: 'toolu_contract_1',
              name: 'search_tool',
              input: {},
            },
          })}\n\n`
        );
        res.write(
          `event: content_block_delta\ndata: ${JSON.stringify({
            type: 'content_block_delta',
            index: 0,
            delta: { type: 'input_json_delta', partial_json: '{"query":"anthropic"}' },
          })}\n\n`
        );
        res.write(
          `event: content_block_stop\ndata: ${JSON.stringify({
            type: 'content_block_stop',
            index: 0,
          })}\n\n`
        );
        res.write(
          `event: message_delta\ndata: ${JSON.stringify({
            type: 'message_delta',
            delta: { stop_reason: 'tool_use' },
            usage: { output_tokens: 20 },
          })}\n\n`
        );
      } else {
        res.write(
          `event: content_block_delta\ndata: ${JSON.stringify({
            type: 'content_block_delta',
            index: 0,
            delta: { type: 'text_delta', text: 'Hello from Anthropic contract!' },
          })}\n\n`
        );
        res.write(
          `event: message_delta\ndata: ${JSON.stringify({
            type: 'message_delta',
            delta: { stop_reason: 'end_turn' },
            usage: { output_tokens: 8 },
          })}\n\n`
        );
      }

      res.write(`event: message_stop\ndata: {"type":"message_stop"}\n\n`);
      res.end();
      return;
    }

    // 3. GOOGLE GEMINI
    if (
      (url.includes('/models') || url.includes('/v1beta/models')) &&
      url.includes('key=') &&
      req.method === 'GET'
    ) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          models: [
            {
              name: 'models/gemini-2.0-flash',
              displayName: 'Gemini 2.0 Flash',
              inputTokenLimit: 1048576,
              supportedGenerationMethods: ['generateContent'],
            },
          ],
        })
      );
      return;
    }

    // 1. OPENAI-COMPATIBLE
    if (url.includes('/models') && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          object: 'list',
          data: [
            {
              id: 'contract-gpt-4',
              context_length: 128000,
              pricing: { prompt: '0', completion: '0' },
            },
            {
              id: 'contract-vision-model',
              context_length: 64000,
              pricing: { prompt: '0', completion: '0' },
            },
          ],
        })
      );
      return;
    }

    if (url.includes('/chat/completions') && req.method === 'POST') {
      const isToolReq = parsedBody?.tools && parsedBody.tools.length > 0;
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      });

      if (isToolReq) {
        res.write(
          `data: ${JSON.stringify({
            id: 'chatcmpl-1',
            choices: [
              {
                delta: {
                  tool_calls: [
                    {
                      index: 0,
                      id: 'call_contract_123',
                      type: 'function',
                      function: { name: 'search_tool', arguments: '{"query":"contract"}' },
                    },
                  ],
                },
                finish_reason: null,
              },
            ],
          })}\n\n`
        );
        res.write(
          `data: ${JSON.stringify({
            id: 'chatcmpl-1',
            choices: [{ delta: {}, finish_reason: 'tool_calls' }],
            usage: { prompt_tokens: 25, completion_tokens: 15, total_tokens: 40 },
          })}\n\n`
        );
      } else {
        res.write(
          `data: ${JSON.stringify({
            id: 'chatcmpl-2',
            choices: [{ delta: { content: 'Hello ' }, finish_reason: null }],
          })}\n\n`
        );
        res.write(
          `data: ${JSON.stringify({
            id: 'chatcmpl-2',
            choices: [{ delta: { content: 'from OpenAI-Compatible contract!' }, finish_reason: 'stop' }],
            usage: { prompt_tokens: 10, completion_tokens: 6, total_tokens: 16 },
          })}\n\n`
        );
      }

      res.write('data: [DONE]\n\n');
      res.end();
      return;
    }

    if (url.includes('streamGenerateContent') && req.method === 'POST') {
      const isToolReq = parsedBody?.tools && parsedBody.tools.length > 0;
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      });

      if (isToolReq) {
        res.write(
          `data: ${JSON.stringify({
            candidates: [
              {
                content: {
                  parts: [
                    {
                      functionCall: {
                        name: 'search_tool',
                        args: { query: 'google' },
                      },
                    },
                  ],
                },
                finishReason: 'STOP',
              },
            ],
            usageMetadata: { promptTokenCount: 20, candidatesTokenCount: 15 },
          })}\n\n`
        );
      } else {
        res.write(
          `data: ${JSON.stringify({
            candidates: [
              {
                content: { parts: [{ text: 'Hello from Google Gemini contract!' }] },
                finishReason: 'STOP',
              },
            ],
            usageMetadata: { promptTokenCount: 12, candidatesTokenCount: 7 },
          })}\n\n`
        );
      }

      res.end();
      return;
    }

    // 4. OLLAMA
    if (url.endsWith('/api/tags') && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          models: [
            {
              name: 'llama3:8b',
              model: 'llama3:8b',
              details: { parameter_size: '8B', family: 'llama' },
            },
          ],
        })
      );
      return;
    }

    if (url.endsWith('/api/chat') && req.method === 'POST') {
      const isToolReq = parsedBody?.tools && parsedBody.tools.length > 0;
      res.writeHead(200, { 'Content-Type': 'application/x-ndjson' });

      if (isToolReq) {
        res.write(
          JSON.stringify({
            model: 'llama3:8b',
            message: {
              role: 'assistant',
              content: '',
              tool_calls: [
                {
                  function: {
                    name: 'search_tool',
                    arguments: { query: 'ollama' },
                  },
                },
              ],
            },
            done: true,
            prompt_eval_count: 18,
            eval_count: 14,
          }) + '\n'
        );
      } else {
        res.write(
          JSON.stringify({
            model: 'llama3:8b',
            message: { role: 'assistant', content: 'Hello from Ollama contract!' },
            done: true,
            prompt_eval_count: 8,
            eval_count: 6,
          }) + '\n'
        );
      }

      res.end();
      return;
    }

    res.writeHead(404);
    res.end('Not Found');
  });

  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve());
  });

  const port = (server.address() as any).port;
  const baseUrl = `http://127.0.0.1:${port}`;

  return {
    server,
    baseUrl,
    receivedRequests,
    close: async () => {
      await new Promise((r) => server.close(r));
    },
  };
}
