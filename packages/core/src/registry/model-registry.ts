import {
  Model,
  ModelOverride,
  ModelTier,
  ProviderConfig,
  RawModel,
} from '@flappycode/protocol';
import { ModelRepository, ProviderRepository, SecretStore } from '@flappycode/storage';
import {
  AnthropicConnector,
  GoogleConnector,
  loadCommunityModelsSnapshot,
  MockProviderConnector,
  OllamaConnector,
  OpenAICompatibleConnector,
  ProviderConnector,
  PROVIDER_PROFILES,
} from '@flappycode/providers';
import { ModelClassifier } from './classifier.js';
import { CapabilityProbe } from './probe.js';
import { FlappyEventBus } from '../events/event-bus.js';

export interface LiveModelState {
  busyCount: number;
  cooldownUntil: number;
  recentErrorRate: number;
}

export class ModelRegistry {
  private connectors = new Map<string, ProviderConnector>();
  private classifier: ModelClassifier;
  public probe = new CapabilityProbe();
  private liveState = new Map<string, LiveModelState>(); // key: provider_id:model_id
  private providerConcurrency = new Map<string, number>();

  constructor(
    private providerRepo: ProviderRepository,
    private modelRepo: ModelRepository,
    private secretStore: SecretStore,
    private eventBus: FlappyEventBus
  ) {
    this.classifier = new ModelClassifier(loadCommunityModelsSnapshot());

    // Register built-in connectors
    this.registerConnector('openai-compatible', new OpenAICompatibleConnector());
    this.registerConnector('ollama', new OllamaConnector());
    // GAP-034: Ollama Cloud reuses the Ollama connector; the profile layer
    // supplies the cloud base URL and Bearer auth requirement.
    this.registerConnector('ollama-cloud', new OllamaConnector());
    this.registerConnector('anthropic', new AnthropicConnector());
    this.registerConnector('google', new GoogleConnector());
    this.registerConnector('mock', new MockProviderConnector());
  }

  public registerConnector(type: string, connector: ProviderConnector): void {
    this.connectors.set(type, connector);
  }

  public getConnector(typeOrId: string): ProviderConnector {
    let conn = this.connectors.get(typeOrId);
    if (!conn) {
      const cfg = this.providerRepo.get(typeOrId);
      if (cfg) {
        conn = this.connectors.get(cfg.type);
      }
    }
    if (!conn) {
      conn = this.connectors.get('openai-compatible');
    }
    if (!conn) {
      throw new Error(`No connector registered for provider '${typeOrId}'`);
    }
    return conn;
  }

  public async addProvider(cfg: ProviderConfig, apiKey?: string): Promise<Model[]> {
    if (!cfg.data_use_policy) {
      const profile = PROVIDER_PROFILES[cfg.id] || PROVIDER_PROFILES[cfg.type];
      cfg.data_use_policy = profile?.defaultDataUsePolicy || 'unknown';
    }
    if (apiKey) {
      await this.secretStore.setSecret(cfg.id, apiKey);
      cfg.api_key_ref = `provider:${cfg.id}`;
    }
    this.providerRepo.save(cfg);
    return this.discoverProviderModels(cfg.id);
  }

  public async discoverProviderModels(providerId: string): Promise<Model[]> {
    const cfg = this.providerRepo.get(providerId);
    if (!cfg) {
      throw new Error(`Provider '${providerId}' not found`);
    }

    const connector = this.connectors.get(cfg.id) || this.getConnector(cfg.type);
    const apiKey = await this.secretStore.resolveSecretRef(cfg.api_key_ref);

    let rawModels: RawModel[] = [];
    try {
      rawModels = await connector.listModels(cfg, apiKey || undefined);
    } catch (err: any) {
      this.eventBus.emit({
        type: 'provider.status',
        provider_id: providerId,
        status: 'offline',
        error: err.message,
        timestamp: Date.now(),
      });
      throw err;
    }

    const existingModels = this.modelRepo.listModels({
      providerId,
      enabledProvidersOnly: false,
    });
    const discoveredIds = new Set(rawModels.map((m) => m.id));

    // Handle disappeared models: mark as unavailable per FR-MOD-006
    for (const em of existingModels) {
      if (!discoveredIds.has(em.model_id) && em.tier !== 'unavailable') {
        this.modelRepo.markUnavailable(providerId, em.model_id);
      }
    }

    const savedModels: Model[] = [];
    for (const raw of rawModels) {
      const override = this.modelRepo.getOverride(providerId, raw.id);
      const classification = this.classifier.classify(providerId, raw, override, cfg.type);
      const existing = this.modelRepo.getModel(providerId, raw.id);

      const model: Model = {
        provider_id: providerId,
        model_id: raw.id,
        tier: classification.tier,
        tier_source: classification.source,
        context_length: raw.context_length,
        modality: existing?.modality || 'text->text',
        supports_tools: raw.supports_tools,
        supports_vision: raw.supports_vision,
        // Keep the last probe result across refreshes unless explicitly invalidated.
        tool_probe_passed: this.probe.getCachedResult(providerId, raw.id) ?? existing?.tool_probe_passed ?? null,
        price_in: raw.price_in,
        price_out: raw.price_out,
        avg_latency_ms: 0,
        last_validated_at: Date.now(),
        data_use_policy: cfg.data_use_policy || 'unknown',
        is_local: (() => {
          const profile = PROVIDER_PROFILES[providerId] || PROVIDER_PROFILES[cfg.type];
          return profile ? profile.isLocal : (cfg.type === 'ollama' || cfg.type === 'lm-studio' || cfg.type === 'llama-cpp');
        })(),
        is_pinned: false,
      };

      this.modelRepo.saveModel(model);
      savedModels.push(model);
    }

    this.emitRegistryUpdated();
    return savedModels;
  }

  public async refreshAllProviders(): Promise<void> {
    const providers = this.providerRepo.listEnabled();
    await Promise.allSettled(providers.map((p) => this.discoverProviderModels(p.id)));
    this.emitRegistryUpdated();
  }

  public getModels(filters?: {
    tier?: ModelTier;
    tiers?: ModelTier[];
    minContext?: number;
    tools?: boolean;
    vision?: boolean;
    providerId?: string;
    modality?: string;
    maxLatencyMs?: number;
    maxPriceIn?: number;
    maxPriceOut?: number;
  }): Model[] {
    return this.modelRepo.listModels({ ...filters, enabledProvidersOnly: true });
  }

  public setOverride(providerId: string, modelId: string, tier: ModelTier): void {
    const override: ModelOverride = {
      provider_id: providerId,
      model_id: modelId,
      tier,
      created_at: Date.now(),
    };
    this.modelRepo.saveOverride(override);
    this.emitRegistryUpdated();
  }

  public deleteOverride(providerId: string, modelId: string): void {
    this.modelRepo.deleteOverride(providerId, modelId);
    // GAP-006: restore the inferred classification immediately so the listing
    // is not stale until the next discovery pass. The SAME classifier is used
    // (no second classification mechanism); pricing-derived results may be
    // refined by a later `providers refresh`.
    this.restoreClassification(providerId, modelId);
    this.emitRegistryUpdated();
  }

  /** Recompute one model's tier from persisted metadata with no override. */
  private restoreClassification(providerId: string, modelId: string): void {
    const model = this.modelRepo.getModel(providerId, modelId);
    if (!model) return;
    const cfg = this.providerRepo.get(providerId);
    const raw: RawModel = {
      id: model.model_id,
      context_length: model.context_length,
      supports_tools: model.supports_tools,
      supports_vision: model.supports_vision,
      price_in: model.price_in,
      price_out: model.price_out,
    };
    const classification = this.classifier.classify(providerId, raw, null, cfg?.type);
    this.modelRepo.saveModel({
      ...model,
      tier: classification.tier,
      tier_source: classification.source,
    });
  }

  public getLiveState(providerId: string, modelId: string): LiveModelState {
    const key = `${providerId}:${modelId}`;
    if (!this.liveState.has(key)) {
      this.liveState.set(key, { busyCount: 0, cooldownUntil: 0, recentErrorRate: 0 });
    }
    return this.liveState.get(key)!;
  }

  public recordModelError(providerId: string, modelId: string, cooldownSec = 60): void {
    const state = this.getLiveState(providerId, modelId);
    state.recentErrorRate += 0.2;
    state.cooldownUntil = Date.now() + cooldownSec * 1000;
  }

  public recordModelSuccess(providerId: string, modelId: string): void {
    const state = this.getLiveState(providerId, modelId);
    state.recentErrorRate = Math.max(0, state.recentErrorRate - 0.1);
  }

  public isAvailable(model: Model): boolean {
    if (model.tier === 'disabled' || model.tier === 'unavailable') {
      return false;
    }
    const state = this.getLiveState(model.provider_id, model.model_id);
    if (state.cooldownUntil > Date.now()) {
      return false;
    }
    // Check provider concurrency
    const currentProviderBusy = this.providerConcurrency.get(model.provider_id) || 0;
    const cfg = this.providerRepo.get(model.provider_id);
    if (cfg && currentProviderBusy >= (cfg.max_concurrency ?? 4)) {
      return false;
    }
    return true;
  }

  public acquireLease(providerId: string, modelId: string): void {
    const state = this.getLiveState(providerId, modelId);
    state.busyCount++;
    const current = this.providerConcurrency.get(providerId) || 0;
    this.providerConcurrency.set(providerId, current + 1);
  }

  public releaseLease(providerId: string, modelId: string): void {
    const state = this.getLiveState(providerId, modelId);
    state.busyCount = Math.max(0, state.busyCount - 1);
    const current = this.providerConcurrency.get(providerId) || 0;
    this.providerConcurrency.set(providerId, Math.max(0, current - 1));
  }

  /**
   * Clear live failure/cooldown state (used when the user resolves a pool
   * exhaustion — conditions have changed, so stale cooldowns must not block
   * the resumed run).
   */
  public clearLiveState(providerId?: string): void {
    for (const [key, state] of this.liveState.entries()) {
      if (!providerId || key.startsWith(`${providerId}:`)) {
        state.cooldownUntil = 0;
        state.recentErrorRate = 0;
      }
    }
    if (!providerId) {
      this.providerConcurrency.clear();
    }
  }

  public countFreeAvailable(): number {
    return this.modelRepo.countFreeAvailableModels();
  }

  /** Persist a tool-calling probe result (FR-MOD-007) so the router can filter on it. */
  public recordProbeResult(providerId: string, modelId: string, passed: boolean): void {
    this.probe.setCachedResult(providerId, modelId, passed);
    const model = this.modelRepo.getModel(providerId, modelId);
    if (model) {
      this.modelRepo.saveModel({ ...model, tool_probe_passed: passed });
    }
  }

  /** Explicitly re-probe a model after capability changes (clears cache + DB state). */
  public reprobeModel(providerId: string, modelId: string): void {
    this.probe.invalidate(providerId, modelId);
    const model = this.modelRepo.getModel(providerId, modelId);
    if (model) {
      this.modelRepo.saveModel({ ...model, tool_probe_passed: null });
    }
  }

  public emitRegistryUpdated(): void {
    const all = this.modelRepo.listModels({ enabledProvidersOnly: true });
    const free = all.filter((m) => m.tier === 'free').length;
    const rateLimitedFree = all.filter((m) => m.tier === 'rate_limited_free').length;
    const paid = all.filter((m) => m.tier === 'paid').length;
    const providers = this.providerRepo.listEnabled().length;

    this.eventBus.emit({
      type: 'registry.updated',
      total_models: all.length,
      free_models: free,
      rate_limited_free_models: rateLimitedFree,
      paid_models: paid,
      connected_providers: providers,
      timestamp: Date.now(),
    });
  }
}
