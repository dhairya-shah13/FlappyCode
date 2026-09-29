export type ScenarioAction =
  | { type: 'ok'; text: string }
  | { type: 'okToolCall'; name: string; args: string | Record<string, unknown> }
  | { type: 'rateLimit'; retryAfterMs?: number }
  | { type: 'http5xx'; status: number; details?: string }
  | { type: 'malformedJson'; text?: string }
  | { type: 'malformedToolCall'; name?: string; invalidArgs?: string }
  | { type: 'timeout'; timeoutMs?: number }
  | { type: 'slowStream'; chunkDelayMs: number; text: string }
  | { type: 'vanishModel'; modelId: string }
  | { type: 'authFail'; message?: string };

export const scenario = {
  ok: (text: string): ScenarioAction => ({ type: 'ok', text }),
  okToolCall: (name: string, args: string | Record<string, unknown>): ScenarioAction => ({
    type: 'okToolCall',
    name,
    args,
  }),
  rateLimit: (options?: { retryAfterMs?: number }): ScenarioAction => ({
    type: 'rateLimit',
    retryAfterMs: options?.retryAfterMs ?? 60000,
  }),
  http5xx: (status = 500, details?: string): ScenarioAction => ({
    type: 'http5xx',
    status,
    details,
  }),
  malformedJson: (text = '{"malformed": '): ScenarioAction => ({
    type: 'malformedJson',
    text,
  }),
  malformedToolCall: (name = 'test_tool', invalidArgs = '{"key": broken'): ScenarioAction => ({
    type: 'malformedToolCall',
    name,
    invalidArgs,
  }),
  timeout: (timeoutMs = 5000): ScenarioAction => ({
    type: 'timeout',
    timeoutMs,
  }),
  slowStream: (chunkDelayMs: number, text: string): ScenarioAction => ({
    type: 'slowStream',
    chunkDelayMs,
    text,
  }),
  vanishModel: (modelId: string): ScenarioAction => ({
    type: 'vanishModel',
    modelId,
  }),
  authFail: (message?: string): ScenarioAction => ({
    type: 'authFail',
    message,
  }),
};
