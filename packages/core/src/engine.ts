import path from 'node:path';
import {
  FlappyConfig,
  Model,
  PlanProposal,
  ProviderConfig,
} from '@flappycode/protocol';
import {
  AgentRepository,
  AuditRepository,
  FlappyDatabase,
  HybridSecretStore,
  ModelRepository,
  ProjectMemoryRepository,
  ProviderHealthRepository,
  ProviderRepository,
  SessionRepository,
  TaskRepository,
  UndoRepository,
  UsageRepository,
} from '@flappycode/storage';
import {
  DetectedProvider,
  DetectorOptions,
  LocalProviderDetector,
  PROVIDER_PROFILES,
} from '@flappycode/providers';

import { FlappyEventBus } from './events/event-bus.js';
import { ModelRegistry } from './registry/model-registry.js';
import { FlappyError, ErrorCodes } from './errors/flappy-error.js';
import { DeterministicRouter } from './router/router.js';
import { RulesLoader } from './rules/rules-loader.js';
import { PlanGate } from './rules/plan-gate.js';
import { DocsKeeper } from './rules/docs-keeper.js';
import { FsJail } from './tools/fs-jail.js';
import { DiffEngine } from './tools/diff-engine.js';
import { UndoEngine } from './tools/undo-engine.js';
import { ShellTool } from './tools/shell-tool.js';
import { GitTool } from './tools/git-tool.js';
import { SearchTool } from './tools/search-tool.js';
import { SecretGuard } from './tools/secret-guard.js';
import { PermissionEngine } from './tools/permission-engine.js';
import { FlappyAutoOrchestrator, AskQuestionRequest } from './orchestration/flappyauto.js';
import { ProviderRateLimiter } from './orchestration/rate-limiter.js';
import { IntervalScheduler } from './registry/scheduler.js';
import { loadConfig, getUserConfigPath, getProjectConfigPath, LoadedConfig } from './config/config-loader.js';
import { loadAgentsFromProject, AgentLoadResult } from './agents/agent-loader.js';
import { AgentDefinition, AgentDefinitionSchema } from '@flappycode/protocol';

export interface FlappyEngineOptions {
  projectRoot?: string;
  dbPath?: string;
  config?: Partial<FlappyConfig>;
  /** Override the registry revalidation interval (ms) — tests inject short values. */
  revalidateIntervalMs?: number;
  /** Skip starting the periodic revalidation scheduler (unit tests). */
  disableScheduler?: boolean;
  /** Test hooks: fast retry policy + programmatic question answers. */
  retryPolicy?: Partial<import('./orchestration/fallback-executor.js').RetryPolicy>;
  askUser?: (req: AskQuestionRequest) => Promise<string>;
  /** Override config file locations (tests must not read the developer's real config). */
  configPaths?: { user?: string; project?: string };
}

export type PoolResolutionAction = 'authorize_paid' | 'add_free_provider' | 'cancel';

export class FlappyEngine {
  public readonly projectRoot: string;
  public readonly eventBus: FlappyEventBus;
  public readonly db: FlappyDatabase;
  public readonly secretStore: HybridSecretStore;
  public readonly providerRepo: ProviderRepository;
  public readonly modelRepo: ModelRepository;
  public readonly sessionRepo: SessionRepository;
  public readonly taskRepo: TaskRepository;
  public readonly auditRepo: AuditRepository;
  public readonly usageRepo: UsageRepository;
  public readonly agentRepo: AgentRepository;
  public readonly healthRepo: ProviderHealthRepository;
  public readonly undoRepo: UndoRepository;

  public readonly registry: ModelRegistry;
  public readonly router: DeterministicRouter;
  public readonly rulesLoader: RulesLoader;
  public readonly planGate: PlanGate;
  public readonly docsKeeper: DocsKeeper;
  public readonly secretGuard: SecretGuard;
  public readonly permissionEngine: PermissionEngine;
  public readonly fsJail: FsJail;
  public readonly diffEngine: typeof DiffEngine;
  public readonly undoEngine: UndoEngine;
  public readonly shell: ShellTool;
  public readonly git: GitTool;
  public readonly search: SearchTool;
  public readonly orchestrator: FlappyAutoOrchestrator;
  public readonly rateLimiter: ProviderRateLimiter;
  public readonly projectMemoryRepo: ProjectMemoryRepository;

  /** Effective configuration (CLI > project > user > defaults), schema-validated. */
  public readonly config: FlappyConfig;
  public readonly configSources: LoadedConfig['sources'];
  /** Invalid `.flappycode/agents/*` files (surfaced, never silently dropped). */
  public readonly agentLoadErrors: AgentLoadResult['errors'];

  private readonly scheduler: IntervalScheduler;
  private pendingDiffResolvers = new Map<string, (approved: boolean) => void>();
  private pendingPermissionResolvers = new Map<string, (decision: 'allow' | 'always' | 'deny') => void>();
  private lastExecutionCallbacks?: {
    onDiff?: (proposal: any) => Promise<boolean>;
    onPermission?: (req: {
      agent: string;
      command: string;
      reason?: string;
      isDestructive?: boolean;
    }) => Promise<'allow' | 'always' | 'deny'>;
  };

  constructor(options: FlappyEngineOptions = {}) {
    this.projectRoot = path.resolve(options.projectRoot || process.cwd());
    this.eventBus = new FlappyEventBus();

    // Config precedence: CLI flags > project > user > defaults (GAP-033).
    const loaded = loadConfig({
      projectRoot: this.projectRoot,
      cliOverrides: options.config as Record<string, any> | undefined,
      userPath: options.configPaths?.user,
      projectPath: options.configPaths?.project,
    });
    this.config = loaded.config;
    this.configSources = loaded.sources;

    this.db = new FlappyDatabase({ path: options.dbPath });
    this.secretStore = new HybridSecretStore();
    this.providerRepo = new ProviderRepository(this.db.db);
    this.modelRepo = new ModelRepository(this.db.db);
    this.sessionRepo = new SessionRepository(this.db.db);
    this.taskRepo = new TaskRepository(this.db.db);
    this.auditRepo = new AuditRepository(this.db.db);
    this.usageRepo = new UsageRepository(this.db.db);
    this.agentRepo = new AgentRepository(this.db.db);
    this.healthRepo = new ProviderHealthRepository(this.db.db);
    this.undoRepo = new UndoRepository(this.db.db);

    this.registry = new ModelRegistry(
      this.providerRepo,
      this.modelRepo,
      this.secretStore,
      this.eventBus
    );
    this.router = new DeterministicRouter(this.registry, this.eventBus);
    this.rulesLoader = new RulesLoader(this.projectRoot, this.config.category);
    this.planGate = new PlanGate();
    this.docsKeeper = new DocsKeeper(this.projectRoot);
    this.secretGuard = new SecretGuard();
    this.permissionEngine = new PermissionEngine(this.config.permissions);

    this.fsJail = new FsJail(this.projectRoot, this.planGate);
    this.diffEngine = DiffEngine;
    this.undoEngine = new UndoEngine(this.fsJail, this.undoRepo);
    this.shell = new ShellTool(this.projectRoot, this.permissionEngine, this.secretGuard);
    this.git = new GitTool(this.shell, this.secretGuard, this.config.git?.protected_branches);

    this.search = new SearchTool(this.fsJail);
    this.rateLimiter = new ProviderRateLimiter();
    this.projectMemoryRepo = new ProjectMemoryRepository(this.db.db);


    // GAP-008: file-backed custom agents; GAP-007: persisted bindings.
    const loadedAgents = loadAgentsFromProject(this.projectRoot);
    this.agentLoadErrors = loadedAgents.errors;
    for (const err of loadedAgents.errors) {
      this.eventBus.emit({
        type: 'log',
        level: 'error',
        message: `Invalid agent definition: ${err.error}`,
        context: { file: err.file },
        timestamp: Date.now(),
      });
    }

    const agentBindings: Record<string, string> = {};
    for (const def of this.agentRepo.list()) {
      if (def.preferred_model_ref && def.preferred_model_ref !== 'flappyauto') {
        agentBindings[def.name] = def.preferred_model_ref;
      }
    }

    this.orchestrator = new FlappyAutoOrchestrator({
      projectRoot: this.projectRoot,
      router: this.router,
      registry: this.registry,
      planGate: this.planGate,
      docsKeeper: this.docsKeeper,
      rulesLoader: this.rulesLoader,
      fsJail: this.fsJail,
      shell: this.shell,
      search: this.search,
      undoEngine: this.undoEngine,
      eventBus: this.eventBus,
      providerRepo: this.providerRepo,
      usageRepo: this.usageRepo,
      secretStore: this.secretStore,
      permissionEngine: this.permissionEngine,
      auditRepo: this.auditRepo,
      taskRepo: this.taskRepo,
      sessionRepo: this.sessionRepo,
      projectMemoryRepo: this.projectMemoryRepo,
      customAgents: loadedAgents.agents,
      agentBindings,
      rateLimiter: this.rateLimiter,
      retryPolicy: options.retryPolicy,
      askUser: options.askUser,
    });

    // GAP-005: periodic registry revalidation with engine lifecycle.
    const intervalMs =
      options.revalidateIntervalMs ??
      this.config.model_policy.revalidate_every_hours * 3_600_000;
    this.scheduler = new IntervalScheduler({
      intervalMs,
      run: async () => {
        if (this.providerRepo.listEnabled().length === 0) return; // nothing to refresh
        await this.registry.refreshAllProviders();
      },
      onError: (err: any) => {
        this.eventBus.emit({
          type: 'log',
          level: 'warn',
          message: `Scheduled registry revalidation failed: ${err?.message || err}`,
          timestamp: Date.now(),
        });
      },
    });
    if (!options.disableScheduler) {
      this.scheduler.start();
    }
  }

  /** Run one revalidation tick immediately (also used by tests). */
  public async runRevalidationNow(): Promise<void> {
    await this.scheduler.tick();
  }

  public stopScheduler(): void {
    this.scheduler.stop();
  }

  // ---------------------------------------------------------------------------
  // Providers
  // ---------------------------------------------------------------------------

  /**
   * Add a provider: resolve credentials, authenticate FIRST (FR-PRV-002),
   * categorize auth vs unreachable failures distinctly, then persist and
   * discover models. Data-use policy comes from the bundled profile list (FR-PRV-006).
   */
  public async addProvider(cfg: ProviderConfig, apiKey?: string): Promise<Model[]> {
    // GAP-041: source data-use policy from the bundled provider profile list.
    const profile = PROVIDER_PROFILES[cfg.id];
    if (profile && (!cfg.data_use_policy || cfg.data_use_policy === 'unknown')) {
      cfg.data_use_policy = profile.defaultDataUsePolicy;
    }

    if (apiKey) {
      await this.secretStore.setSecret(cfg.id, apiKey);
      this.secretGuard.addSecret(apiKey);
      cfg.api_key_ref = `provider:${cfg.id}`;
    }

    // B6/GAP-039: validate credentials before persisting/activating.
    const connector = this.registry.getConnector(cfg.id);
    let resolvedKey: string | undefined;
    if (cfg.api_key_ref) {
      resolvedKey = (await this.secretStore.resolveSecretRef(cfg.api_key_ref)) || undefined;
    }
    const auth = await connector.authenticate(cfg, resolvedKey);
    if (!auth.success) {
      const category = auth.category || 'auth';
      this.eventBus.emit({
        type: 'provider.status',
        provider_id: cfg.id,
        status: category === 'unreachable' ? 'offline' : category === 'rate_limited' ? 'rate_limited' : 'auth_failed',
        error: auth.error,
        timestamp: Date.now(),
      });
      if (category === 'unreachable') {
        throw new Error(
          `Endpoint unreachable for '${cfg.display_name}': ${auth.error}. Check the base URL and network connectivity, then retry 'flappycode providers add'.`
        );
      }
      if (category === 'rate_limited') {
        throw new Error(
          `Provider '${cfg.display_name}' rate-limited the validation request: ${auth.error}. Wait for the limit to reset, then retry.`
        );
      }
      throw new Error(
        `Authentication failed for '${cfg.display_name}': ${auth.error}. Verify your API key and retry 'flappycode providers add'.`
      );
    }

    this.providerRepo.save(cfg);
    const models = await this.registry.discoverProviderModels(cfg.id);
    return models;
  }

  public async refreshProviders(): Promise<void> {
    await this.registry.refreshAllProviders();
  }

  public getFreeModelsCount(): number {
    return this.registry.countFreeAvailable();
  }

  public getModels(): Model[] {
    return this.registry.getModels();
  }

  /**
   * GAP-006 (FR-MOD-005): resolve a user-supplied model reference to a
   * registered model. Accepts `provider/model-id` or a bare model id when it
   * is unambiguous. Throws a clear error for unknown/ambiguous references.
   */
  private resolveModelRef(modelRef: string): { provider_id: string; model_id: string } {
    const models = this.registry.getModels();
    const [maybeProvider, ...rest] = modelRef.split('/');
    if (rest.length > 0) {
      const provider_id = maybeProvider;
      const model_id = rest.join('/');
      const hit = models.find((m) => m.provider_id === provider_id && m.model_id === model_id);
      if (!hit) {
        throw new Error(
          `Unknown model '${modelRef}'. Run 'flappycode models' to list registered models.`
        );
      }
      return { provider_id: hit.provider_id, model_id: hit.model_id };
    }
    const matches = models.filter((m) => m.model_id === modelRef);
    if (matches.length === 0) {
      throw new Error(
        `Unknown model '${modelRef}'. Run 'flappycode models' to list registered models.`
      );
    }
    if (matches.length > 1) {
      const providers = matches.map((m) => m.provider_id).join(', ');
      throw new Error(
        `Model id '${modelRef}' is ambiguous across providers (${providers}). Use '<provider>/<model-id>'.`
      );
    }
    return { provider_id: matches[0].provider_id, model_id: matches[0].model_id };
  }

  /**
   * GAP-006 (FR-MOD-005): force-tag a registered model to a user tier.
   * The override persists to SQLite through the registry/repository API and
   * survives provider refresh; classifier precedence is unchanged.
   * Note: tagging a model `free` is an explicit user statement about routing
   * eligibility — it never grants paid usage (PaidGate is unaffected).
   */
  public setModelOverride(
    modelRef: string,
    tier: 'free' | 'paid' | 'disabled'
  ): { provider_id: string; model_id: string; tier: Model['tier'] } {
    const target = this.resolveModelRef(modelRef);
    this.registry.setOverride(target.provider_id, target.model_id, tier);
    return { ...target, tier };
  }

  /** GAP-006: remove a user tier override, restoring inferred classification. */
  public deleteModelOverride(modelRef: string): { provider_id: string; model_id: string } {
    const target = this.resolveModelRef(modelRef);
    this.registry.deleteOverride(target.provider_id, target.model_id);
    return target;
  }

  // ---------------------------------------------------------------------------
  // Runs
  // ---------------------------------------------------------------------------

  public async submitPrompt(
    prompt: string,
    options: string | { model?: string; sessionId?: string } = {}
  ): Promise<PlanProposal> {
    return this.orchestrator.startRun(prompt, options);
  }

  public approvePlan(runId: string): void {
    this.orchestrator.approvePlan(runId);
  }

  public rejectPlan(runId: string, reason?: string): void {
    this.orchestrator.rejectPlan(runId, reason);
  }

  public failRun(runId: string, error: string, reason: string, errorDetails?: any): void {
    this.orchestrator.failRun(runId, error, reason, errorDetails);
  }

  public async executePlan(
    runId: string,
    onDiffApprovalRequired?: (proposal: any) => Promise<boolean>,
    onPermissionApprovalRequired?: (req: {
      agent: string;
      command: string;
      reason?: string;
      isDestructive?: boolean;
    }) => Promise<'allow' | 'always' | 'deny'>,
    execOpts: { approvalProvenance?: 'headless_flag' } = {}
  ): Promise<void> {
    const diffHandler = onDiffApprovalRequired ?? (async (_proposal: any) => {
      return new Promise<boolean>((resolve) => {
        this.pendingDiffResolvers.set(runId, resolve);
      });
    });

    const permHandler = onPermissionApprovalRequired ?? (async (req: {
      agent: string;
      command: string;
      reason?: string;
      isDestructive?: boolean;
    }) => {
      const permId = `perm_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      this.eventBus.emit({
        type: 'approval.requested',
        approval_id: permId,
        run_id: runId,
        kind: 'permission',
        title: 'Tool Permission Required',
        description: req.reason || `Agent '${req.agent}' requests permission to run '${req.command}'`,
        details: { agent: req.agent, command: req.command, is_destructive: req.isDestructive },
        timestamp: Date.now(),
      });
      return new Promise<'allow' | 'always' | 'deny'>((resolve) => {
        this.pendingPermissionResolvers.set(permId, resolve);
      });
    });

    this.lastExecutionCallbacks = { onDiff: diffHandler, onPermission: permHandler };
    try {
      await this.orchestrator.executeApprovedPlan(
        runId,
        diffHandler,
        permHandler,
        execOpts
      );
    } finally {
      this.pendingDiffResolvers.delete(runId);
    }
  }

  public approveDiff(runId: string): void {
    const resolver = this.pendingDiffResolvers.get(runId);
    if (!resolver) {
      throw new FlappyError({
        code: ErrorCodes.INVALID_STATE,
        category: 'command',
        what: `No pending diff approval for run '${runId}'.`,
        next: 'Ensure a run is executing and currently waiting for diff approval.',
      });
    }
    this.pendingDiffResolvers.delete(runId);
    resolver(true);
  }

  public rejectDiff(runId: string, _reason?: string): void {
    const resolver = this.pendingDiffResolvers.get(runId);
    if (!resolver) {
      throw new FlappyError({
        code: ErrorCodes.INVALID_STATE,
        category: 'command',
        what: `No pending diff approval for run '${runId}'.`,
        next: 'Ensure a run is executing and currently waiting for diff approval.',
      });
    }
    this.pendingDiffResolvers.delete(runId);
    resolver(false);
  }

  public grantPermission(permissionId: string, decision: 'allow' | 'always' | 'deny'): void {
    const resolver = this.pendingPermissionResolvers.get(permissionId);
    if (!resolver) {
      throw new FlappyError({
        code: ErrorCodes.INVALID_STATE,
        category: 'command',
        what: `No pending permission request '${permissionId}'.`,
        next: 'Verify the permission_id matches an active approval request.',
      });
    }
    this.pendingPermissionResolvers.delete(permissionId);
    resolver(decision);
  }

  /** Cancel an active run (FR-ORC-010); in-flight calls abort, nodes become cancelled. */
  public cancelRun(runId?: string): void {
    if (runId) {
      const diffRes = this.pendingDiffResolvers.get(runId);
      if (diffRes) {
        this.pendingDiffResolvers.delete(runId);
        diffRes(false);
      }
    } else {
      for (const res of this.pendingDiffResolvers.values()) {
        res(false);
      }
      this.pendingDiffResolvers.clear();
    }
    for (const res of this.pendingPermissionResolvers.values()) {
      res('deny');
    }
    this.pendingPermissionResolvers.clear();

    this.orchestrator.cancel(runId);
    if (runId) {
      try {
        const run = this.taskRepo.getTaskRun(runId);
        if (run && run.status === 'paused_pool_exhausted') {
          this.taskRepo.setRunStatus(runId, 'cancelled');
          this.orchestrator.clearPause(runId);
        }
      } catch { /* best effort */ }
    }
  }

  public answerQuestion(questionId: string, answer: string): boolean {
    return this.orchestrator.answerQuestion(questionId, answer);
  }

  /** Install an interactive question handler (used by the TUI). */
  public setAskUser(fn?: (req: AskQuestionRequest) => Promise<string>): void {
    this.orchestrator.setAskUser(fn);
  }

  /**
   * GAP-002: resolve a paused pool-exhausted run. Exactly two actions exist:
   * `authorize_paid` (requires explicit confirmation before any PaidGrant)
   * and `add_free_provider` (refresh/discover, then resume).
   */
  public async resolvePoolExhausted(
    runId: string,
    action: PoolResolutionAction,
    opts: { confirm?: boolean; modelId?: string } = {}
  ): Promise<{ resumed: boolean; plan?: PlanProposal }> {
    if (!this.orchestrator.isPaused(runId)) {
      throw new Error(`No paused pool-exhausted run '${runId}' to resolve.`);
    }

    // The user acted: conditions changed, so stale cooldowns/error state from
    // the exhausted attempt must not block the resumed run.
    this.registry.clearLiveState();

    if (action === 'authorize_paid') {
      this.orchestrator.authorizePaidForExhaustion(opts.modelId, opts.confirm === true);
    } else if (action === 'add_free_provider') {
      await this.registry.refreshAllProviders();
      if (this.registry.countFreeAvailable() === 0) {
        // Honest: nothing changed, the run stays paused.
        throw new Error(
          'The free model pool is still exhausted: no free/rate-limited-free models are available after refresh. Connect a free-tier provider (flappycode providers add ...) or authorize paid credit, then resolve again.'
        );
      }
    } else if (action === 'cancel') {
      this.orchestrator.clearPause(runId);
      try {
        this.taskRepo.setRunStatus(runId, 'cancelled');
      } catch { /* best effort */ }
      return { resumed: false };
    }

    const plan = await this.orchestrator.resumeAfterExhaustion(runId);
    if (plan) {
      // Paused during planning: a fresh plan was produced; caller must obtain approval.
      return { resumed: false, plan };
    }
    // Paused mid-execution: resume the exact paused run with stored callbacks.
    await this.executePlan(
      runId,
      this.lastExecutionCallbacks?.onDiff,
      this.lastExecutionCallbacks?.onPermission
    );
    return { resumed: true };
  }

  // ---------------------------------------------------------------------------
  // Agents
  // ---------------------------------------------------------------------------

  public listAgents(): Record<string, AgentDefinition> {
    return this.orchestrator.listAgents();
  }

  public getAgent(name: string): AgentDefinition | null {
    return this.orchestrator.listAgents()[name] ?? null;
  }

  /** `flappycode agents bind <agent> <model-id>` — persists the binding (GAP-007). */
  public bindAgent(agentName: string, modelId: string): void {
    const def = this.getAgent(agentName);
    if (!def) {
      const known = Object.keys(this.listAgents()).join(', ');
      throw new Error(`Unknown agent '${agentName}'. Known agents: ${known}.`);
    }
    if (modelId !== 'flappyauto') {
      const models = this.registry.getModels();
      const exists = models.some((m) => m.model_id === modelId);
      if (!exists) {
        throw new Error(
          `Unknown model '${modelId}'. Run 'flappycode models' to list registered models, or 'flappyauto' to restore automatic routing.`
        );
      }
    }
    const ok = this.agentRepo.setBinding(agentName, modelId, def);
    if (!ok) {
      throw new Error(`Could not persist binding for agent '${agentName}'.`);
    }
    this.orchestrator.setAgentBinding(agentName, modelId);
    this.eventBus.emit({
      type: 'log',
      level: 'info',
      message: `Agent '${agentName}' bound to model '${modelId}'.`,
      context: { agent: agentName, model: modelId },
      timestamp: Date.now(),
    });
  }

  public unbindAgent(agentName: string): void {
    this.agentRepo.clearBinding(agentName);
    this.orchestrator.setAgentBinding(agentName, 'flappyauto');
  }

  // ---------------------------------------------------------------------------
  // Diagnostics
  // ---------------------------------------------------------------------------

  public getConfigPaths(): { user: string; project: string } {
    return { user: getUserConfigPath(), project: getProjectConfigPath(this.projectRoot) };
  }

  public async testProviders(providerId?: string): Promise<
    Array<{
      provider_id: string;
      display_name: string;
      status: 'healthy' | 'degraded' | 'unreachable' | 'unknown' | 'auth_failed' | 'rate_limited';
      latency_ms: number;
      error?: string;
    }>
  > {
    const providers = providerId
      ? [this.providerRepo.get(providerId)].filter(Boolean) as ProviderConfig[]
      : this.providerRepo.listEnabled();

    if (providerId && providers.length === 0) {
      throw new Error(`Provider '${providerId}' not found.`);
    }

    const results = [];
    for (const p of providers) {
      const connector = this.registry.getConnector(p.id);
      if (!connector) {
        results.push({
          provider_id: p.id,
          display_name: p.display_name,
          status: 'unknown' as const,
          latency_ms: 0,
          error: `No connector registered for provider type '${p.type}'`,
        });
        continue;
      }

      const apiKey = await this.secretStore.getSecret(p.id);
      let health: import('@flappycode/providers').HealthInfo;
      try {
        health = await connector.healthCheck(p, apiKey || undefined);
      } catch (err: any) {
        health = {
          status: 'offline',
          latencyMs: 0,
          lastChecked: Date.now(),
          error: err.message,
        };
      }

      let mappedStatus: 'healthy' | 'degraded' | 'unreachable' | 'unknown' | 'auth_failed' | 'rate_limited';
      if (health.status === 'healthy') mappedStatus = 'healthy';
      else if (health.status === 'auth_failed') mappedStatus = 'auth_failed';
      else if (health.status === 'rate_limited') mappedStatus = 'rate_limited';
      else if (health.status === 'offline' || (health.status as any) === 'unhealthy') mappedStatus = 'unreachable';
      else mappedStatus = 'unknown';

      const record = this.healthRepo.recordCheck({
        provider_id: p.id,
        status: mappedStatus,
        latency_ms: health.latencyMs,
        error: health.error,
      });

      this.eventBus.emit({
        type: 'provider.tested',
        provider_id: p.id,
        status: mappedStatus,
        latency_ms: health.latencyMs,
        error: health.error,
        timestamp: Date.now(),
      });

      this.eventBus.emit({
        type: 'provider.status',
        provider_id: p.id,
        status: health.status,
        latency_ms: health.latencyMs,
        error: health.error,
        timestamp: Date.now(),
      });

      results.push({
        provider_id: p.id,
        display_name: p.display_name,
        status: mappedStatus,
        latency_ms: record.latency_ms,
        error: record.last_error || undefined,
      });
    }

    return results;
  }

  public async detectLocalProviders(opts?: DetectorOptions): Promise<DetectedProvider[]> {
    return LocalProviderDetector.detectAll(opts);
  }

  public async doctor(): Promise<{
    nodeVersion: string;
    keychainActive: boolean;
    dbOpen: boolean;
    dbIntegrity: boolean;
    providersCount: number;
    providersReachable: number;
    providerHealth: Array<{ id: string; status: string; latency_ms: number; error?: string }>;
    freeModelsCount: number;
    gitInstalled: boolean;
    configProject: boolean;
    configUser: boolean;
    agentsLoaded: number;
    agentErrors: number;
    remediationHints: string[];
  }> {
    let gitOk = false;
    try {
      const res = await this.shell.execute('git --version', { isUserApproved: true });
      gitOk = res.exitCode === 0;
    } catch {
      gitOk = false;
    }

    let dbIntegrity = false;
    try {
      const row = (this.db.db as any).prepare('PRAGMA integrity_check').get() as any;
      dbIntegrity = row && (row.integrity_check === 'ok' || Object.values(row)[0] === 'ok');
    } catch {
      dbIntegrity = false;
    }

    const enabledProviders = this.providerRepo.listEnabled();
    const testResults = await this.testProviders().catch(() => []);
    const reachableCount = testResults.filter((r) => r.status === 'healthy').length;

    const hints: string[] = [];
    if (!gitOk) {
      hints.push('Git is not installed or not in PATH. Install git to enable git tooling and checkpoint tracking.');
    }
    if (enabledProviders.length === 0) {
      hints.push('No providers connected. Run "flappycode providers add" to connect a provider.');
    } else if (reachableCount === 0 && enabledProviders.length > 0) {
      hints.push('All enabled providers failed reachability checks. Run "flappycode providers test" for details.');
    }
    if (this.agentLoadErrors.length > 0) {
      hints.push(`${this.agentLoadErrors.length} custom agent definition(s) failed validation in .flappycode/agents.`);
    }

    return {
      nodeVersion: process.version,
      keychainActive: this.secretStore.isKeychainActive(),
      dbOpen: this.db.db.open,
      dbIntegrity,
      providersCount: enabledProviders.length,
      providersReachable: reachableCount,
      providerHealth: testResults.map((r) => ({
        id: r.provider_id,
        status: r.status,
        latency_ms: r.latency_ms,
        error: r.error,
      })),
      freeModelsCount: this.getFreeModelsCount(),
      gitInstalled: gitOk,
      configProject: !!this.configSources.project,
      configUser: !!this.configSources.user,
      agentsLoaded: Object.keys(this.listAgents()).length,
      agentErrors: this.agentLoadErrors.length,
      remediationHints: hints,
    };
  }


  public undo(): { success: boolean; restoredFiles: string[]; error?: string } {
    return this.undoEngine.undoLatest();
  }

  // ---------------------------------------------------------------------------
  // Sessions (GAP-025 / GAP-054)
  // ---------------------------------------------------------------------------

  /** List all sessions, optionally filtered by project. */
  public listSessions(): Array<{ id: string; project_path: string; created_at: number; updated_at: number; summary?: string }> {
    return this.sessionRepo.listSessions(this.projectRoot);
  }

  /** Delete a session and cascade-delete its runs, messages, and nodes. */
  public deleteSession(sessionId: string): void {
    this.sessionRepo.deleteSession(sessionId);
  }

  /** Get a session and its message history (GAP-025/054). */
  public resumeSession(sessionId: string): { session: any; messages: any[] } | null {
    const session = this.sessionRepo.getSession(sessionId);
    if (!session) return null;
    const messages = this.sessionRepo.getMessages(sessionId);
    return { session, messages };
  }

  /**
   * Resume a session by id (GAP-025/054). Returns the latest non-completed
   * task run prompt to re-submit. Safe resume semantics: does not carry
   * forward stale approvals.
   */
  public getResumableRun(sessionId: string): { runId: string; prompt: string; status: string } | null {
    const session = this.sessionRepo.getSession(sessionId);
    if (!session) return null;
    // Find the latest task run that is NOT completed.
    const sql = `SELECT * FROM task_run WHERE session_id = ? AND status NOT IN ('completed', 'rejected', 'cancelled') ORDER BY id DESC LIMIT 1`;
    const row = (this.db.db as any).prepare(sql).get(sessionId) as any;
    if (!row) return null;
    return { runId: row.id, prompt: row.prompt, status: row.status };
  }

  /**
   * Resume the latest session in this project directory (--continue).
   * Returns the session id + resumable run info, or null if nothing to resume.
   */
  public getLatestResumableSession(): { sessionId: string; runId: string; prompt: string; status: string } | null {
    const sessions = this.sessionRepo.listSessions(this.projectRoot);
    for (const s of sessions) {
      const run = this.getResumableRun(s.id);
      if (run) return { sessionId: s.id, ...run };
    }
    return null;
  }

  public close(): void {
    this.scheduler.dispose();
    this.db.close();
  }
}
