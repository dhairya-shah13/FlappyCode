import { ModelOverride, ModelTier, RawModel, TierSource } from '@flappycode/protocol';
import { PROVIDER_PROFILES } from '@flappycode/providers';

export interface ClassificationResult {
  tier: ModelTier;
  source: TierSource;
}

export class ModelClassifier {
  constructor(private communityCatalog: Record<string, any> = {}) {}

  public setCommunityCatalog(catalog: Record<string, any>): void {
    this.communityCatalog = catalog;
  }

  public classify(
    providerId: string,
    rawModel: RawModel,
    userOverride?: ModelOverride | null,
    providerType?: string
  ): ClassificationResult {
    // 1. User override (highest precedence)
    if (userOverride && userOverride.tier) {
      return {
        tier: userOverride.tier,
        source: 'override',
      };
    }

    const modelId = rawModel.id;
    const qualifiedKey = `${providerId}/${modelId}`;
    const modelsCatalog = this.communityCatalog.models || {};

    // 2. Community override list
    if (modelsCatalog[qualifiedKey]?.tier) {
      return {
        tier: modelsCatalog[qualifiedKey].tier as ModelTier,
        source: 'community',
      };
    }
    // Also check unqualified model id in community list
    if (modelsCatalog[modelId]?.tier) {
      return {
        tier: modelsCatalog[modelId].tier as ModelTier,
        source: 'community',
      };
    }

    // 3. Provider pricing metadata
    if (rawModel.price_in === 0 && rawModel.price_out === 0 && rawModel.raw_metadata?.pricing) {
      return {
        tier: 'free',
        source: 'metadata',
      };
    }

    // 4. Provider-specific rules
    const profile = PROVIDER_PROFILES[providerId] || (providerType ? PROVIDER_PROFILES[providerType] : undefined);
    if (profile) {
      if (profile.freeClassifierRule) {
        if (profile.freeClassifierRule(modelId, rawModel.raw_metadata)) {
          return {
            tier: modelId.includes(':free') ? 'free' : (profile.isLocal ? 'free' : 'rate_limited_free'),
            source: 'rule',
          };
        }
      } else if (profile.isLocal) {
        return {
          tier: 'free',
          source: 'rule',
        };
      }
    }

    // Fallback: Default to paid-until-proven
    return {
      tier: 'paid',
      source: 'metadata',
    };
  }
}
