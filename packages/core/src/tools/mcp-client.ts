import { ChildProcess, spawn } from 'node:child_process';
import readline from 'node:readline';
import { ToolDefinition } from '@flappycode/providers';

export interface McpServerConfig {
  name: string;
  command: string;
  args?: string[];
  env?: Record<string, string>;
  permissionTier?: 'read' | 'write' | 'execute';
  timeoutMs?: number;
}

export interface McpToolMetadata {
  serverName: string;
  originalName: string;
  permissionTier: 'read' | 'write' | 'execute';
}

export class McpServerSession {
  private proc: ChildProcess | null = null;
  private nextId = 1;
  private pending = new Map<
    number,
    { resolve: (v: any) => void; reject: (err: any) => void; timer: NodeJS.Timeout }
  >();
  private isInitialized = false;
  private isTerminated = false;
  private tools: Array<{ name: string; description: string; inputSchema: Record<string, any> }> = [];

  constructor(public readonly config: McpServerConfig) {}

  public async start(): Promise<boolean> {
    try {
      const env = { ...process.env, ...this.config.env };
      this.proc = spawn(this.config.command, this.config.args || [], {
        env,
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      this.proc.on('error', () => {
        this.terminate();
      });

      this.proc.on('exit', () => {
        this.terminate();
      });

      if (!this.proc.stdout || !this.proc.stdin) {
        this.terminate();
        return false;
      }

      const rl = readline.createInterface({
        input: this.proc.stdout,
        terminal: false,
      });

      rl.on('line', (line) => {
        const trimmed = line.trim();
        if (!trimmed) return;
        try {
          const msg = JSON.parse(trimmed);
          this.handleMessage(msg);
        } catch {}
      });

      // Handshake: initialize
      const initResult = await this.sendRequest('initialize', {
        protocolVersion: '2024-11-05',
        capabilities: {
          roots: { listChanged: false },
          sampling: {},
        },
        clientInfo: {
          name: 'flappycode',
          version: '0.1.0',
        },
      });

      if (!initResult) {
        this.terminate();
        return false;
      }

      this.sendNotification('notifications/initialized', {});
      this.isInitialized = true;

      // Enumerate tools
      await this.refreshTools();
      return true;
    } catch {
      this.terminate();
      return false;
    }
  }

  public async refreshTools(): Promise<void> {
    if (!this.isInitialized || this.isTerminated) return;
    try {
      const res = await this.sendRequest('tools/list', {});
      if (res && Array.isArray(res.tools)) {
        this.tools = res.tools;
      }
    } catch {
      this.tools = [];
    }
  }

  public getCachedTools(): Array<{ name: string; description: string; inputSchema: Record<string, any> }> {
    return this.tools;
  }

  public async callTool(toolName: string, args: Record<string, any>): Promise<any> {
    if (!this.isInitialized || this.isTerminated) {
      throw new Error(`MCP server '${this.config.name}' is not running`);
    }

    const res = await this.sendRequest('tools/call', {
      name: toolName,
      arguments: args,
    });

    if (res && res.isError) {
      const errMsg = Array.isArray(res.content)
        ? res.content.map((c: any) => c.text || JSON.stringify(c)).join('\n')
        : 'MCP tool execution failed';
      throw new Error(`MCP tool error [${toolName}]: ${errMsg}`);
    }

    if (res && Array.isArray(res.content)) {
      return res.content.map((c: any) => c.text || JSON.stringify(c)).join('\n');
    }

    return res;
  }

  public isActive(): boolean {
    return this.isInitialized && !this.isTerminated;
  }

  public async shutdown(): Promise<void> {
    this.terminate();
  }

  public terminate(): void {
    if (this.isTerminated) return;
    this.isTerminated = true;
    this.isInitialized = false;

    for (const [id, req] of this.pending.entries()) {
      clearTimeout(req.timer);
      req.reject(new Error(`MCP server '${this.config.name}' terminated during request id ${id}`));
    }
    this.pending.clear();

    if (this.proc) {
      try {
        this.proc.kill();
      } catch {}
      this.proc = null;
    }
  }

  private sendRequest(method: string, params: any): Promise<any> {
    return new Promise((resolve, reject) => {
      if (this.isTerminated || !this.proc || !this.proc.stdin) {
        return reject(new Error(`MCP server '${this.config.name}' is not running`));
      }

      const id = this.nextId++;
      const timeoutMs = this.config.timeoutMs || 8000;

      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`MCP request '${method}' to '${this.config.name}' timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      this.pending.set(id, { resolve, reject, timer });

      const msg = JSON.stringify({
        jsonrpc: '2.0',
        id,
        method,
        params,
      });

      try {
        this.proc.stdin.write(msg + '\n');
      } catch (err) {
        clearTimeout(timer);
        this.pending.delete(id);
        this.terminate();
        reject(err);
      }
    });
  }

  private sendNotification(method: string, params: any): void {
    if (this.isTerminated || !this.proc || !this.proc.stdin) return;
    const msg = JSON.stringify({
      jsonrpc: '2.0',
      method,
      params,
    });
    try {
      this.proc.stdin.write(msg + '\n');
    } catch {
      this.terminate();
    }
  }

  private handleMessage(msg: any): void {
    if (msg.id !== undefined && (msg.result !== undefined || msg.error !== undefined)) {
      const p = this.pending.get(msg.id);
      if (p) {
        clearTimeout(p.timer);
        this.pending.delete(msg.id);
        if (msg.error) {
          p.reject(new Error(msg.error.message || 'MCP JSON-RPC error'));
        } else {
          p.resolve(msg.result);
        }
      }
    }
  }
}

export class McpClient {
  private serverConfigs = new Map<string, McpServerConfig>();
  private sessions = new Map<string, McpServerSession>();
  private toolRegistry = new Map<string, McpToolMetadata>();

  public registerServer(cfg: McpServerConfig): void {
    this.serverConfigs.set(cfg.name, cfg);
  }

  public getServer(name: string): McpServerConfig | undefined {
    return this.serverConfigs.get(name);
  }

  public async listTools(): Promise<ToolDefinition[]> {
    const definitions: ToolDefinition[] = [];
    this.toolRegistry.clear();

    const counts = new Map<string, number>();

    // 1. Ensure sessions are initialized and collect tools
    for (const [name, cfg] of this.serverConfigs.entries()) {
      let session = this.sessions.get(name);
      if (!session || !session.isActive()) {
        session = new McpServerSession(cfg);
        const ok = await session.start();
        if (ok) {
          this.sessions.set(name, session);
        } else {
          continue;
        }
      }

      for (const t of session.getCachedTools()) {
        counts.set(t.name, (counts.get(t.name) || 0) + 1);
      }
    }

    // 2. Register tools with conflict detection and normalization
    for (const [serverName, session] of this.sessions.entries()) {
      if (!session.isActive()) continue;
      const cfg = this.serverConfigs.get(serverName)!;
      const tier = cfg.permissionTier || 'execute';

      for (const t of session.getCachedTools()) {
        // Namespace prefix: mcp__<server>__<tool>
        const namespacedName = `mcp__${serverName}__${t.name}`;
        this.toolRegistry.set(namespacedName, {
          serverName,
          originalName: t.name,
          permissionTier: tier,
        });

        // Also register short name if not colliding
        const isUnique = counts.get(t.name) === 1;
        if (isUnique) {
          this.toolRegistry.set(t.name, {
            serverName,
            originalName: t.name,
            permissionTier: tier,
          });
        }

        definitions.push({
          type: 'function',
          function: {
            name: namespacedName,
            description: `[MCP: ${serverName}] ${t.description || t.name}`,
            parameters: t.inputSchema || { type: 'object', properties: {} },
          },
        });
      }
    }

    return definitions;
  }

  public async callTool(
    toolName: string,
    args: Record<string, any>,
    permissionChecker?: (meta: McpToolMetadata) => Promise<boolean>
  ): Promise<any> {
    const meta = this.toolRegistry.get(toolName);
    if (!meta) {
      throw new Error(`MCP tool '${toolName}' not found`);
    }

    // Permission enforcement
    if (permissionChecker) {
      const allowed = await permissionChecker(meta);
      if (!allowed) {
        throw new Error(`Permission denied for MCP tool '${toolName}'`);
      }
    }

    const session = this.sessions.get(meta.serverName);
    if (!session || !session.isActive()) {
      throw new Error(`MCP server '${meta.serverName}' is not running`);
    }

    return session.callTool(meta.originalName, args);
  }

  public isAvailable(serverName?: string): boolean {
    if (serverName) {
      const s = this.sessions.get(serverName);
      return Boolean(s && s.isActive());
    }
    for (const s of this.sessions.values()) {
      if (s.isActive()) return true;
    }
    return false;
  }

  public async shutdown(): Promise<void> {
    for (const session of this.sessions.values()) {
      await session.shutdown();
    }
    this.sessions.clear();
    this.toolRegistry.clear();
  }
}

