import { PlanToken } from '@flappycode/protocol';

export class PlanGate {
  private activeTokens = new Map<string, PlanToken>(); // run_id -> PlanToken

  public issueToken(runId: string, allowedFiles: string[], ttlMs = 3600000): PlanToken {
    const token: PlanToken = {
      token: `token_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      run_id: runId,
      allowed_files: allowedFiles,
      issued_at: Date.now(),
      expires_at: Date.now() + ttlMs,
    };
    this.activeTokens.set(runId, token);
    return token;
  }

  public getToken(runId: string): PlanToken | undefined {
    return this.activeTokens.get(runId);
  }

  public createToken(
    runId: string,
    plan: { files_to_modify?: string[]; files_to_create?: string[] },
    ttlMs = 3600000
  ): PlanToken {
    const files = [...(plan.files_to_modify || []), ...(plan.files_to_create || [])];
    return this.issueToken(runId, files, ttlMs);
  }

  public validateOperation(runId: string, filePath: string): boolean {
    const token = this.activeTokens.get(runId);
    if (!token) return false;
    if (token.expires_at < Date.now()) {
      this.activeTokens.delete(runId);
      return false;
    }
    // Check if file is in allowed_files (or if wildcard is present)
    if (token.allowed_files.includes('*')) return true;
    const clean = filePath.replace(/^[/\\]+/, '').replace(/^\.[/\\]/, '').replace(/\\/g, '/');
    return token.allowed_files.some((af) => {
      const cleanAf = af.replace(/^[/\\]+/, '').replace(/^\.[/\\]/, '').replace(/\\/g, '/');
      return cleanAf === clean || clean.endsWith('/' + cleanAf) || cleanAf.endsWith('/' + clean);
    });
  }

  public revokeToken(runId: string): void {
    this.activeTokens.delete(runId);
  }

  public clear(): void {
    this.activeTokens.clear();
  }
}
