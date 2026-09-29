import { AgentDefinition, EventBus } from '@flappycode/protocol';
import {
  AbortedError,
  Message,
  ProviderConnector,
  ToolCall,
  ToolDefinition,
} from '@flappycode/providers';

export interface ToolExecutionResult {
  result: string;
  isError?: boolean;
}

export type ToolHandler = (call: ToolCall) => Promise<ToolExecutionResult>;

export interface RunAgentLimits {
  maxSteps?: number;
  timeoutMs?: number;
}

export interface RunAgentOptions {
  agent: AgentDefinition;
  connector: ProviderConnector;
  modelId: string;
  messages: Message[];
  tools?: ToolDefinition[];
  toolHandler?: ToolHandler;
  planToken?: string;
  bus?: EventBus;
  signal?: AbortSignal;
  limits?: RunAgentLimits;
}

export interface RunAgentResult {
  messages: Message[];
  finalText: string;
  toolCallsCount: number;
  stepsCount: number;
  tokensUsed: {
    prompt: number;
    completion: number;
    total: number;
  };
}

export async function runAgent(options: RunAgentOptions): Promise<RunAgentResult> {
  const maxSteps = options.limits?.maxSteps ?? 10;
  const conversation: Message[] = [...options.messages];

  // Prepend agent system prompt if provided and not already present
  if (options.agent.systemPrompt) {
    const hasSystem = conversation.some((m) => m.role === 'system');
    if (!hasSystem) {
      conversation.unshift({
        role: 'system',
        content: options.agent.systemPrompt,
      });
    }
  }

  // Filter tools to only those allowed by this agent
  const allowedToolDefs = (options.tools || []).filter((t) =>
    options.agent.allowedTools.includes(t.name)
  );

  let stepsCount = 0;
  let toolCallsCount = 0;
  let finalText = '';
  const tokensUsed = { prompt: 0, completion: 0, total: 0 };

  while (stepsCount < maxSteps) {
    if (options.signal?.aborted) {
      throw new AbortedError('Agent run aborted by signal.');
    }

    stepsCount++;

    const stream = options.connector.complete({
      model: options.modelId,
      messages: conversation,
      tools: allowedToolDefs.length > 0 ? allowedToolDefs : undefined,
    }, options.signal);

    let currentText = '';
    const pendingToolCalls: ToolCall[] = [];

    for await (const chunk of stream) {
      if (options.signal?.aborted) {
        throw new AbortedError('Agent run aborted during streaming.');
      }

      if (chunk.type === 'text-delta') {
        currentText += chunk.text;
      } else if (chunk.type === 'tool-call') {
        pendingToolCalls.push(chunk.toolCall);
      } else if (chunk.type === 'usage') {
        tokensUsed.prompt += chunk.usage.promptTokens;
        tokensUsed.completion += chunk.usage.completionTokens;
        tokensUsed.total += chunk.usage.totalTokens;
      }
    }

    finalText = currentText;

    // Model finished without tool calls -> task step complete
    if (pendingToolCalls.length === 0) {
      conversation.push({
        role: 'assistant',
        content: currentText,
      });
      break;
    }

    // Append assistant's tool-call response to messages
    conversation.push({
      role: 'assistant',
      content: currentText,
      toolCalls: pendingToolCalls,
    });

    // Execute each tool call and record result verbatim
    for (const call of pendingToolCalls) {
      toolCallsCount++;

      // Check tool permission guard
      if (!options.agent.allowedTools.includes(call.name)) {
        conversation.push({
          role: 'tool',
          toolCallId: call.id,
          content: `Error: Tool "${call.name}" is not permitted for agent "${options.agent.name}". Permitted tools: [${options.agent.allowedTools.join(', ')}]`,
        });
        continue;
      }

      // Check argument format and provide one repair attempt if malformed
      try {
        if (call.arguments.trim().length > 0) {
          JSON.parse(call.arguments);
        }
      } catch (err) {
        conversation.push({
          role: 'tool',
          toolCallId: call.id,
          content: `Error: Malformed JSON arguments for tool "${call.name}": ${err instanceof Error ? err.message : String(err)}. Please fix the JSON arguments and try again.`,
        });
        continue;
      }

      // Execute tool handler if provided
      if (options.toolHandler) {
        try {
          const outcome = await options.toolHandler(call);
          conversation.push({
            role: 'tool',
            toolCallId: call.id,
            content: outcome.result,
          });
        } catch (err) {
          conversation.push({
            role: 'tool',
            toolCallId: call.id,
            content: `Tool execution failed: ${err instanceof Error ? err.message : String(err)}`,
          });
        }
      } else {
        // Default stub result
        conversation.push({
          role: 'tool',
          toolCallId: call.id,
          content: `[Tool ${call.name} executed successfully with arguments: ${call.arguments}]`,
        });
      }
    }
  }

  return {
    messages: conversation,
    finalText,
    toolCallsCount,
    stepsCount,
    tokensUsed,
  };
}
