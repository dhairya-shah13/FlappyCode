import { ChildProcess, spawn } from 'node:child_process';
import path from 'node:path';
import url from 'node:url';

export interface DiagnosticRange {
  start: { line: number; character: number };
  end: { line: number; character: number };
}

export interface Diagnostic {
  file: string;
  line: number;
  message: string;
  severity: 'error' | 'warning' | 'info';
  code?: string | number;
  source?: string;
  range?: DiagnosticRange;
}

export interface LspServerConfig {
  command: string;
  args?: string[];
  env?: Record<string, string>;
  timeoutMs?: number;
}

const DEFAULT_SERVER_COMMANDS: Record<string, LspServerConfig> = {
  typescript: {
    command: 'typescript-language-server',
    args: ['--stdio'],
  },
  javascript: {
    command: 'typescript-language-server',
    args: ['--stdio'],
  },
  python: {
    command: 'pyright-langserver',
    args: ['--stdio'],
  },
  rust: {
    command: 'rust-analyzer',
    args: [],
  },
  go: {
    command: 'gopls',
    args: [],
  },
};

export class LanguageServerSession {
  private proc: ChildProcess | null = null;
  private buffer = Buffer.alloc(0);
  private nextRequestId = 1;
  private pendingRequests = new Map<
    number,
    { resolve: (value: any) => void; reject: (err: any) => void; timer: NodeJS.Timeout }
  >();
  private openDocuments = new Map<string, number>(); // uri -> version
  private diagnosticsByUri = new Map<string, Diagnostic[]>();
  private isInitialized = false;
  private isTerminated = false;

  constructor(
    public readonly language: string,
    public readonly config: LspServerConfig,
    public readonly projectRoot: string
  ) {}

  public async start(): Promise<boolean> {
    try {
      const env = { ...process.env, ...this.config.env };
      this.proc = spawn(this.config.command, this.config.args || [], {
        cwd: this.projectRoot,
        env,
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      this.proc.on('error', () => {
        this.terminate();
      });

      this.proc.on('exit', () => {
        this.terminate();
      });

      if (this.proc.stdout) {
        this.proc.stdout.on('data', (chunk: Buffer) => this.handleData(chunk));
      }

      // Send initialize request
      const rootUri = url.pathToFileURL(this.projectRoot).toString();
      const initResult = await this.sendRequest('initialize', {
        processId: process.pid,
        rootUri,
        rootPath: this.projectRoot,
        capabilities: {
          textDocument: {
            publishDiagnostics: {
              relatedInformation: true,
              versionSupport: true,
            },
            synchronization: {
              dynamicRegistration: false,
              willSave: false,
              willSaveWaitUntil: false,
              didSave: false,
            },
          },
        },
      });

      if (!initResult) {
        this.terminate();
        return false;
      }

      // Send initialized notification
      this.sendNotification('initialized', {});
      this.isInitialized = true;
      return true;
    } catch {
      this.terminate();
      return false;
    }
  }

  public async notifyOpen(filePath: string, content: string): Promise<void> {
    if (!this.isInitialized || this.isTerminated) return;
    const uri = this.pathToUri(filePath);
    const version = 1;
    this.openDocuments.set(uri, version);

    this.sendNotification('textDocument/didOpen', {
      textDocument: {
        uri,
        languageId: this.language,
        version,
        text: content,
      },
    });
  }

  public async notifyChange(filePath: string, content: string): Promise<void> {
    if (!this.isInitialized || this.isTerminated) return;
    const uri = this.pathToUri(filePath);
    let version = (this.openDocuments.get(uri) || 0) + 1;
    this.openDocuments.set(uri, version);

    if (!this.openDocuments.has(uri)) {
      await this.notifyOpen(filePath, content);
      return;
    }

    this.sendNotification('textDocument/didChange', {
      textDocument: {
        uri,
        version,
      },
      contentChanges: [
        {
          text: content,
        },
      ],
    });
  }

  public async notifyClose(filePath: string): Promise<void> {
    if (!this.isInitialized || this.isTerminated) return;
    const uri = this.pathToUri(filePath);
    if (!this.openDocuments.has(uri)) return;
    this.openDocuments.delete(uri);

    this.sendNotification('textDocument/didClose', {
      textDocument: { uri },
    });
  }

  public getDiagnostics(filePath?: string): Diagnostic[] {
    if (filePath) {
      const uri = this.pathToUri(filePath);
      return this.diagnosticsByUri.get(uri) || [];
    }
    const all: Diagnostic[] = [];
    for (const diags of this.diagnosticsByUri.values()) {
      all.push(...diags);
    }
    return all;
  }

  public async shutdown(): Promise<void> {
    if (this.isTerminated) return;
    try {
      if (this.isInitialized) {
        await Promise.race([
          this.sendRequest('shutdown', {}),
          new Promise((resolve) => setTimeout(resolve, 2000)),
        ]);
        this.sendNotification('exit', {});
      }
    } catch {}
    this.terminate();
  }

  public terminate(): void {
    if (this.isTerminated) return;
    this.isTerminated = true;
    this.isInitialized = false;

    for (const [id, req] of this.pendingRequests.entries()) {
      clearTimeout(req.timer);
      req.reject(new Error(`LSP server terminated during request id ${id}`));
    }
    this.pendingRequests.clear();

    if (this.proc) {
      try {
        this.proc.kill('SIGKILL');
      } catch {}
      this.proc = null;
    }
  }

  public isActive(): boolean {
    return this.isInitialized && !this.isTerminated;
  }

  private sendRequest(method: string, params: any): Promise<any> {
    return new Promise((resolve, reject) => {
      if (this.isTerminated || !this.proc || !this.proc.stdin) {
        return reject(new Error('LSP server is not running'));
      }
      const id = this.nextRequestId++;
      const timeoutMs = this.config.timeoutMs || 8000;

      const timer = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(new Error(`LSP request '${method}' timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      this.pendingRequests.set(id, { resolve, reject, timer });

      const msg = JSON.stringify({
        jsonrpc: '2.0',
        id,
        method,
        params,
      });

      this.writeMessage(msg);
    });
  }

  private sendNotification(method: string, params: any): void {
    if (this.isTerminated || !this.proc || !this.proc.stdin) return;
    const msg = JSON.stringify({
      jsonrpc: '2.0',
      method,
      params,
    });
    this.writeMessage(msg);
  }

  private writeMessage(content: string): void {
    if (!this.proc || !this.proc.stdin) return;
    const byteLength = Buffer.byteLength(content, 'utf8');
    const header = `Content-Length: ${byteLength}\r\n\r\n`;
    try {
      this.proc.stdin.write(header + content);
    } catch {
      this.terminate();
    }
  }

  private handleData(chunk: Buffer): void {
    this.buffer = Buffer.concat([this.buffer, chunk]);

    while (true) {
      const headerEndIndex = this.buffer.indexOf('\r\n\r\n');
      if (headerEndIndex === -1) break;

      const headerText = this.buffer.slice(0, headerEndIndex).toString('ascii');
      const match = headerText.match(/Content-Length:\s*(\d+)/i);
      if (!match) {
        // Malformed header, discard
        this.buffer = this.buffer.slice(headerEndIndex + 4);
        continue;
      }

      const contentLength = parseInt(match[1], 10);
      const totalMessageLength = headerEndIndex + 4 + contentLength;

      if (this.buffer.length < totalMessageLength) {
        // Incomplete body, wait for next chunk
        break;
      }

      const bodyBuffer = this.buffer.slice(headerEndIndex + 4, totalMessageLength);
      this.buffer = this.buffer.slice(totalMessageLength);

      try {
        const message = JSON.parse(bodyBuffer.toString('utf8'));
        this.handleMessage(message);
      } catch {
        // Malformed JSON-RPC body, ignored defensively
      }
    }
  }

  private handleMessage(message: any): void {
    // Response to a request
    if (message.id !== undefined && (message.result !== undefined || message.error !== undefined)) {
      const pending = this.pendingRequests.get(message.id);
      if (pending) {
        clearTimeout(pending.timer);
        this.pendingRequests.delete(message.id);
        if (message.error) {
          pending.reject(new Error(message.error.message || 'LSP request failed'));
        } else {
          pending.resolve(message.result);
        }
      }
      return;
    }

    // Notification: publishDiagnostics
    if (message.method === 'textDocument/publishDiagnostics' && message.params) {
      const uri = message.params.uri;
      const rawDiags = message.params.diagnostics || [];
      const normalized: Diagnostic[] = rawDiags.map((d: any) => {
        let severity: 'error' | 'warning' | 'info' = 'info';
        if (d.severity === 1) severity = 'error';
        else if (d.severity === 2) severity = 'warning';

        const line = (d.range?.start?.line ?? 0) + 1; // 1-indexed
        return {
          file: this.uriToPath(uri),
          line,
          message: d.message || 'Diagnostic issue',
          severity,
          code: d.code,
          source: d.source || 'lsp',
          range: d.range,
        };
      });
      this.diagnosticsByUri.set(uri, normalized);
    }
  }

  private pathToUri(filePath: string): string {
    const absPath = path.isAbsolute(filePath) ? filePath : path.resolve(this.projectRoot, filePath);
    return url.pathToFileURL(absPath).toString();
  }

  private uriToPath(uriStr: string): string {
    try {
      return url.fileURLToPath(uriStr);
    } catch {
      return uriStr;
    }
  }
}

export class LspClient {
  private sessions = new Map<string, LanguageServerSession>(); // language -> session
  private serverConfigs = new Map<string, LspServerConfig>();
  private failedLanguages = new Set<string>();

  constructor(customConfigs?: Record<string, LspServerConfig>) {
    for (const [lang, cfg] of Object.entries(DEFAULT_SERVER_COMMANDS)) {
      this.serverConfigs.set(lang, cfg);
    }
    if (customConfigs) {
      for (const [lang, cfg] of Object.entries(customConfigs)) {
        this.serverConfigs.set(lang, cfg);
      }
    }
  }

  public registerLanguageServer(language: string, config: LspServerConfig): void {
    this.serverConfigs.set(language, config);
    this.failedLanguages.delete(language);
  }

  public async getDiagnostics(projectPath: string, filePath?: string): Promise<Diagnostic[]> {
    if (filePath) {
      const lang = this.detectLanguage(filePath);
      if (!lang) return [];
      const session = await this.ensureSession(lang, projectPath);
      if (!session) return [];
      return session.getDiagnostics(filePath);
    }

    const results: Diagnostic[] = [];
    for (const session of this.sessions.values()) {
      if (session.isActive()) {
        results.push(...session.getDiagnostics());
      }
    }
    return results;
  }

  public async notifyChange(filePath: string, content: string, projectPath: string): Promise<void> {
    const lang = this.detectLanguage(filePath);
    if (!lang) return;
    const session = await this.ensureSession(lang, projectPath);
    if (!session) return;
    await session.notifyChange(filePath, content);
  }

  public isAvailable(language?: string): boolean {
    if (language) {
      const session = this.sessions.get(language);
      return Boolean(session && session.isActive());
    }
    for (const session of this.sessions.values()) {
      if (session.isActive()) return true;
    }
    return false;
  }

  public async shutdown(): Promise<void> {
    const promises: Promise<void>[] = [];
    for (const session of this.sessions.values()) {
      promises.push(session.shutdown());
    }
    await Promise.all(promises);
    this.sessions.clear();
  }

  public detectLanguage(filePath: string): string | null {
    const ext = path.extname(filePath).toLowerCase();
    switch (ext) {
      case '.ts':
      case '.tsx':
        return 'typescript';
      case '.js':
      case '.jsx':
      case '.mjs':
      case '.cjs':
        return 'javascript';
      case '.py':
        return 'python';
      case '.rs':
        return 'rust';
      case '.go':
        return 'go';
      case '.json':
        return 'json';
      default:
        return null;
    }
  }

  private async ensureSession(
    language: string,
    projectRoot: string
  ): Promise<LanguageServerSession | null> {
    if (this.failedLanguages.has(language)) {
      return null;
    }

    const existing = this.sessions.get(language);
    if (existing && existing.isActive()) {
      return existing;
    }

    const config = this.serverConfigs.get(language);
    if (!config) {
      return null;
    }

    const session = new LanguageServerSession(language, config, projectRoot);
    const started = await session.start();
    if (!started) {
      this.failedLanguages.add(language);
      return null;
    }

    this.sessions.set(language, session);
    return session;
  }
}

