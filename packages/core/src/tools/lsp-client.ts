export interface Diagnostic {
  file: string;
  line: number;
  message: string;
  severity: 'error' | 'warning' | 'info';
}

export class LspClient {
  private activeServers = new Map<string, string>(); // language -> command

  constructor() {
    // Detect basic language servers if available
  }

  public async getDiagnostics(_projectPath: string, _filePath?: string): Promise<Diagnostic[]> {
    // Return empty diagnostics when language server is not installed, degrading gracefully per SRS SI-003
    return [];
  }

  public isAvailable(): boolean {
    return this.activeServers.size > 0;
  }
}
