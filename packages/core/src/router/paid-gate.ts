import { PaidGrant } from '@flappycode/protocol';

export class PaidGate {
  private activeGrants = new Map<string, PaidGrant>(); // key: model_id

  public issueGrant(
    providerId: string,
    modelId: string,
    reason: 'user_pinned' | 'pool_exhaustion_authorized'
  ): PaidGrant {
    const grant: PaidGrant = {
      id: `grant_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      provider_id: providerId,
      model_id: modelId,
      granted_at: Date.now(),
      reason,
    };
    this.activeGrants.set(modelId, grant);
    return grant;
  }

  public hasGrant(modelId: string): boolean {
    return this.activeGrants.has(modelId);
  }

  public getGrant(modelId: string): PaidGrant | undefined {
    return this.activeGrants.get(modelId);
  }

  public listGrants(): PaidGrant[] {
    return Array.from(this.activeGrants.values());
  }

  public revokeGrant(modelId: string): void {
    this.activeGrants.delete(modelId);
  }

  public clear(): void {
    this.activeGrants.clear();
  }
}
