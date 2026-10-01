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
  ProviderRepository,
  SessionRepository,
  TaskRepository,
  UsageRepository,
} from '@flappycode/storage';
import { PROVIDER_PROFILES } from '@flappycode/providers';
import { FlappyEventBus } from './events/event-bus.js';
import { ModelRegistry } from './registry/model-registry.js';
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

  /** Effective configuration (CLI > project > user > defaults), schema-validated. */
  public readonly config: FlappyConfig;
  public readonly configSources: LoadedConfig['sources'];
  /** Invalid `.flappycode/agents/*` files (surfaced, never silently dropped). */
  public readonly agentLoadErrors: AgentLoadResult['errors'];

  private readonly scheduler: IntervalScheduler;
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

    this.registry = new ModelRegistry(
      this.providerRepo,
      this.modelRepo,
      this.secretStore,
      this.eventBus
    );
    this.router = new DeterministicRouter(this.registry, this.eventBus);
    this.rulesLoader = new RulesLoader(this.projectRoot);
    this.planGate = new PlanGate();
    this.docsKeeper = new DocsKeeper(this.projectRoot);
    this.secretGuard = new SecretGuard();
    this.permissionEngine = new PermissionEngine(this.config.permissions);

    this.fsJail = new FsJail(this.projectRoot, this.planGate);
    this.diffEngine = DiffEngine;
    this.undoEngine = new UndoEngine(this.fsJail);
    this.shell = new ShellTool(this.projectRoot, this.permissionEngine, this.secretGuard);
    this.git = new GitTool(this.shell, this.secretGuard);
    this.search = new SearchTool(this.fsJail);
    this.rateLimiter = new ProviderRateLimiter();

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
    const connector = this.registry.getConnector(cfg.type);
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
    this.lastExecutionCallbacks = { onDiff: onDiffApprovalRequired, onPermission: onPermissionApprovalRequired };
    await this.orchestrator.executeApprovedPlan(
      runId,
      onDiffApprovalRequired,
      onPermissionApprovalRequired,
      execOpts
    );
  }

  /** Cancel an active run (FR-ORC-010); in-flight calls abort, nodes become cancelled. */
  public cancelRun(runId?: string): void {
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

  public async doctor(): Promise<{
    nodeVersion: string;
    keychainActive: boolean;
    dbOpen: boolean;
    providersCount: number;
    freeModelsCount: number;
    gitInstalled: boolean;
    configProject: boolean;
    configUser: boolean;
    agentsLoaded: number;
    agentErrors: number;
  }> {
    let gitOk = false;
    try {
      const res = await this.shell.execute('git --version', { isUserApproved: true });
      gitOk = res.exitCode === 0;
    } catch {
      gitOk = false;
    }

    return {
      nodeVersion: process.version,
      keychainActive: this.secretStore.isKeychainActive(),
      dbOpen: this.db.db.open,
      providersCount: this.providerRepo.listEnabled().length,
      freeModelsCount: this.getFreeModelsCount(),
      gitInstalled: gitOk,
      configProject: !!this.configSources.project,
      configUser: !!this.configSources.user,
      agentsLoaded: Object.keys(this.listAgents()).length,
      agentErrors: this.agentLoadErrors.length,
    };
  }

  public undo(): { success: boolean; restoredFiles: string[]; error?: string } {
    return this.undoEngine.undoLatest();
  }

  public close(): void {
    this.scheduler.dispose();
    this.db.close();
  }
}
