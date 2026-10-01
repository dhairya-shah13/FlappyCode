import { ToolDefinition } from '@flappycode/providers';

export interface McpServerConfig {
  name: string;
  command: string;
  args?: string[];
  env?: Record<string, string>;
}

export class McpClient {
  private servers: Map<string, McpServerConfig> = new Map();

  public registerServer(cfg: McpServerConfig): void {
    this.servers.set(cfg.name, cfg);
  }

  public async listTools(): Promise<ToolDefinition[]> {
    // Return registered MCP tool definitions
    return [];
  }

  public async callTool(_toolName: string, _args: Record<string, any>): Promise<any> {
    throw new Error('No MCP server configured');
  }
}
