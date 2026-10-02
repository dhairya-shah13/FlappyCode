import {
  AgentDefinition,
  FileDiff,
  PaidGrant,
  PlanProposal,
  StructuredError,
  TaskNode,
} from '@flappycode/protocol';
import { ErrorCodes } from '../errors/flappy-error.js';
import { ModelRegistry } from '../registry/model-registry.js';
import { DeterministicRouter } from '../router/router.js';
import { PlanGate } from '../rules/plan-gate.js';
import { DocsKeeper } from '../rules/docs-keeper.js';
import { RulesLoader } from '../rules/rules-loader.js';
import { PromptComposer } from '../rules/prompt-composer.js';
import { FsJail } from '../tools/fs-jail.js';
import { DiffEngine } from '../tools/diff-engine.js';
import { UndoEngine } from '../tools/undo-engine.js';
import { ShellTool } from '../tools/shell-tool.js';
import { SearchTool } from '../tools/search-tool.js';
import { SemanticIndex } from '../tools/semantic-index.js';
import { LspClient } from '../tools/lsp-client.js';
import { BUILTIN_AGENTS } from '../agents/agent-definitions.js';
import { FlappyEventBus } from '../events/event-bus.js';
import { TaskPlanner } from './planner.js';
import { DagExecutor } from './dag-executor.js';
import { ContextManager } from './context-manager.js';
import {
  FallbackExecutor,
  FallbackExecuteOptions,
  FallbackAttemptContext,
  PoolExhaustedError,
  RetryPolicy,
  RunCancelledError,
} from './fallback-executor.js';
import { ProviderRateLimiter } from './rate-limiter.js';
import { PermissionEngine } from '../tools/permission-engine.js';
import { StopConditions } from '../rules/stop-conditions.js';
import {
  AuditRepository,
  ProjectMemoryRepository,
  ProviderRepository,
  SecretStore,
  SessionRepository,
  TaskRepository,
  UsageRepository,
} from '@flappycode/storage';
import { ChatMessage, CompletionRequest, ToolDefinition } from '@flappycode/providers';

/** Raised when the Reviewer/Tester feedback loop exhausts its bounded iterations. */
export class FeedbackLoopEscalatedError extends Error {
  public readonly code = 'FEEDBACK_LOOP_ESCALATED';
  constructor(message: string) {
    super(message);
    this.name = 'FeedbackLoopEscalatedError';
  }
}

export const DEFAULT_MAX_FEEDBACK_ITERATIONS = 3;
const MAX_AGENT_TURNS = 6;

export interface AskQuestionRequest {
  questionId: string;
  runId: string;
  agent: string;
  question: string;
  options: string[];
}

export interface FlappyAutoOptions {
  projectRoot: string;
  router: DeterministicRouter;
  registry: ModelRegistry;
  planGate: PlanGate;
  docsKeeper: DocsKeeper;
  rulesLoader: RulesLoader;
  fsJail: FsJail;
  shell: ShellTool;
  search: SearchTool;
  undoEngine: UndoEngine;
  eventBus: FlappyEventBus;
  providerRepo: ProviderRepository;
  usageRepo: UsageRepository;
  secretStore: SecretStore;
  permissionEngine?: PermissionEngine;
  auditRepo?: AuditRepository;
  taskRepo?: TaskRepository;
  sessionRepo?: SessionRepository;
  projectMemoryRepo?: ProjectMemoryRepository;
  /** File-backed/custom agent definitions (GAP-008). */
  customAgents?: Record<string, AgentDefinition>;
  /** Per-agent model bindings (GAP-007 `agents bind`). */
  agentBindings?: Record<string, string>;
  /** Programmatic answer source for questions/pinned-fallback decisions. */
  askUser?: (req: AskQuestionRequest) => Promise<string>;
  /** Bounded Reviewer/Tester -> Coder feedback iterations (default 3). */
  maxFeedbackIterations?: number;
  rateLimiter?: ProviderRateLimiter;
  retryPolicy?: Partial<RetryPolicy>;
  lspClient?: LspClient;
  semanticIndex?: SemanticIndex;
}

interface ToolCallAssembled {
  id: string;
  name: string;
  arguments: string;
}

interface FeedbackEntry {
  iteration: number;
  from: string;
  text: string;
}

export class FlappyAutoOrchestrator {
  public readonly contextManager = new ContextManager();
  private pendingPlan: PlanProposal | null = null;
  private pendingDiffs: FileDiff[] = [];
  private stagedChanges = new Map<string, string>(); // path -> newContent
  private activeRunId: string | null = null;
  private activeSessionId: string | null = null;
  private modelsUsed = new Set<string>();
  private paidCallsCount = 0;
  private runStartedAt = 0;

  private fallback: FallbackExecutor;
  private activeExecutors = new Map<string, DagExecutor>();
  private planAbort: AbortController | null = null;

  /** Multi-turn conversation state per node (survives feedback iterations). */
  private nodeMessages = new Map<string, ChatMessage[]>();
  private nodeOutputs = new Map<string, string>();
  private nodeFeedback = new Map<string, FeedbackEntry>();
  private appliedFeedback = new Map<string, number>();
  private pinDisabledNodes = new Set<string>();

  private pendingQuestions = new Map<
    string,
    { resolve: (answer: string) => void; request: AskQuestionRequest }
  >();
  private questionCounter = 0;

  /** Runs paused by pool exhaustion awaiting resolution (GAP-002). */
  private pausedRuns = new Set<string>();
  private emittedRunFailed = new Set<string>();
  /** Stored so a pool-exhaustion pause during planning can replan after resolution. */
  private lastPrompt: { prompt: string; options: { model?: string; sessionId?: string } } | null = null;

  private onPermissionApproval?: (req: {
    agent: string;
    command: string;
    reason?: string;
    isDestructive?: boolean;
  }) => Promise<'allow' | 'always' | 'deny'>;

  constructor(private opts: FlappyAutoOptions) {
    this.fallback = new FallbackExecutor({
      router: opts.router,
      registry: opts.registry,
      eventBus: opts.eventBus,
      providerRepo: opts.providerRepo,
      secretStore: opts.secretStore,
      retryPolicy: opts.retryPolicy,
      rateLimiter: opts.rateLimiter,
      askUser: async ({ runId, nodeId, agent, pinnedModelId, message }) => {
        const answer = await this.askQuestion(runId, agent, message, [
          'next_best_fit',
          'cancel',
        ]);
        void nodeId;
        return answer === 'next_best_fit' ? ('next_best_fit' as const) : ('cancel' as const);
      },
    });
    // GAP-026: wire SQLite-backed project memory if available.
    if (opts.projectMemoryRepo) {
      this.contextManager.initProjectMemory(opts.projectMemoryRepo, opts.projectRoot);
    }
  }

  // ---------------------------------------------------------------------------
  // Questions (GAP-048) + pinned-model fallback decisions (GAP-044)
  // ---------------------------------------------------------------------------

  /**
   * Emit question.asked and wait for an answer (interactive askUser handler,
   * engine.answerQuestion, or the server answerQuestion command).
   */
  public askQuestion(runId: string, agent: string, question: string, options: string[]): Promise<string> {
    const questionId = `q_${Date.now()}_${this.questionCounter++}`;
    const request: AskQuestionRequest = { questionId, runId, agent, question, options };

    const pending = new Promise<string>((resolve) => {
      this.pendingQuestions.set(questionId, { resolve, request });
    });

    this.opts.eventBus.emit({
      type: 'question.asked',
      question_id: questionId,
      run_id: runId,
      agent,
      question,
      options,
      timestamp: Date.now(),
    });

    if (this.opts.askUser) {
      // Programmatic/interactive handler drives the answer; route it back
      // through answerQuestion so state stays consistent either way.
      void Promise.resolve(this.opts.askUser(request)).then(
        (answer) => this.answerQuestion(questionId, answer),
        () => this.answerQuestion(questionId, options[options.length - 1] ?? 'cancel')
      );
    } else {
      // Headless / non-interactive deterministic fallback (FR-ASK-004)
      const defaultAnswer = options[0] || 'cancel';
      setTimeout(() => {
        if (this.pendingQuestions.has(questionId)) {
          this.answerQuestion(questionId, defaultAnswer);
        }
      }, 50);
    }

    return pending;
  }

  public answerQuestion(questionId: string, answer: string): boolean {
    const pending = this.pendingQuestions.get(questionId);
    if (!pending) return false;
    this.pendingQuestions.delete(questionId);
    pending.resolve(answer);

    this.opts.eventBus.emit({
      type: 'question.answered',
      question_id: questionId,
      run_id: pending.request.runId,
      answer,
      timestamp: Date.now(),
    });

    if (this.activeSessionId && this.opts.sessionRepo) {
      try {
        this.opts.sessionRepo.addMessage(this.activeSessionId, 'user', `Answer to "${pending.request.question}": ${answer}`);
      } catch {
        /* session persistence must not break the run */
      }
    }
    return true;
  }


  public hasPendingQuestion(questionId: string): boolean {
    return this.pendingQuestions.has(questionId);
  }

  /** Install (or clear) an interactive answer handler after construction. */
  public setAskUser(fn?: (req: AskQuestionRequest) => Promise<string>): void {
    this.opts.askUser = fn;
  }

  // ---------------------------------------------------------------------------
  // Run lifecycle
  // ---------------------------------------------------------------------------

  public async startRun(
    prompt: string,
    options: string | { model?: string; sessionId?: string } = {},
    /** GAP-002: reuse the paused run's id when re-planning after exhaustion. */
    reuseRunId?: string
  ): Promise<PlanProposal> {
    const opts = typeof options === 'string' ? { sessionId: options } : options;
    this.lastPrompt = { prompt, options: opts };
    const runId = reuseRunId || `run_${Date.now()}`;
    this.activeRunId = runId;
    this.modelsUsed.clear();
    this.paidCallsCount = 0;
    this.stagedChanges.clear();
    this.pendingDiffs = [];
    this.nodeMessages.clear();
    this.nodeOutputs.clear();
    this.nodeFeedback.clear();
    this.appliedFeedback.clear();
    this.pinDisabledNodes.clear();
    this.emittedRunFailed.clear();
    this.runStartedAt = Date.now();
    this.pausedRuns.delete(runId);

    this.opts.eventBus.emit({ type: 'run.started', run_id: runId, prompt, timestamp: Date.now() });

    // Session creation + message persistence (FR-CTX-001)
    // GAP-002: when re-planning a paused run under the same id, keep the
    // original session instead of opening a duplicate one.
    let sessionId = opts.sessionId ?? (reuseRunId ? this.activeSessionId ?? undefined : undefined);
    if (sessionId && !this.opts.sessionRepo?.getSession(sessionId)) {
      sessionId = undefined;
    }
    if (!sessionId && this.opts.sessionRepo) {
      sessionId = `ses_${Date.now()}`;
      try {
        this.opts.sessionRepo.createSession(sessionId, this.opts.projectRoot);
        this.opts.eventBus.emit({
          type: 'session.started',
          session_id: sessionId,
          project_path: this.opts.projectRoot,
          timestamp: Date.now(),
        });
      } catch {
        sessionId = undefined;
      }
    }
    if (sessionId && this.opts.sessionRepo) {
      try {
        this.opts.sessionRepo.addMessage(sessionId, 'user', prompt);
      } catch {
        /* non-fatal */
      }
    }
    this.activeSessionId = sessionId ?? null;

    const singleModel = opts.model && opts.model !== 'flappyauto' ? opts.model : undefined;
    const rules = this.opts.rulesLoader.loadRules();

    if (rules.conflicts.length > 0) {
      this.opts.eventBus.emit({
        type: 'rule.conflict_detected',
        conflicts: rules.conflicts,
        timestamp: Date.now(),
      });
    }
    const projectFiles = this.opts.fsJail.listFiles('.', true);
    const availableAgents = this.listAgents();

    // GAP-007: single-model mode bypasses the planner entirely —
    // construct a single Coder node directly without LLM planning.
    if (singleModel) {
      const plan: PlanProposal = {
        run_id: runId,
        goal: prompt,
        graph: {
          id: `graph_${Date.now()}`,
          goal: prompt,
          nodes: [
            {
              id: 'node-1',
              agent: 'Coder',
              description: prompt,
              depends_on: [],
              status: 'pending',
              substitutions: [],
              tool_calls: [],
              iterations: 0,
            },
          ],
          created_at: Date.now(),
        },
        files_to_modify: [],
        assumptions: [],
        risks: [],
        planner_model: singleModel,
        timestamp: Date.now(),
      };

      if (this.opts.taskRepo && this.activeSessionId) {
        try {
          this.opts.taskRepo.createTaskRun(runId, this.activeSessionId, prompt, 'created');
        } catch { /* run row optional */ }
      }

      this.pendingPlan = plan;
      this.opts.eventBus.emit({ type: 'plan.proposed', plan, timestamp: Date.now() });
      this.opts.eventBus.emit({
        type: 'approval.requested',
        approval_id: `appr_plan_${runId}`,
        run_id: runId,
        kind: 'plan',
        title: 'Implementation Plan Approval',
        description: `Single-model mode: "${plan.goal}" targeting ${singleModel}`,
        details: { files_to_modify: plan.files_to_modify, assumptions: plan.assumptions },
        timestamp: Date.now(),
      });
      return plan;
    }

    this.planAbort = new AbortController();
    let plan: PlanProposal;
    try {
      plan = await this.fallback.execute(
        {
          runId,
          agent: 'Planner',
          requirements: { taskType: 'planning', minContext: 8192, tools: false, vision: false },
          pinnedModelId: undefined,
          pinnedFallbackPolicy: 'ask_user',
          signal: this.planAbort.signal,
          onModelUsed: (model, isPinned) => {
            this.modelsUsed.add(model.model_id);
            if (model.tier === 'paid') this.paidCallsCount++;
            this.opts.eventBus.emit({
              type: 'model.selected',
              run_id: runId,
              node_id: 'planner',
              agent: 'Planner',
              model,
              is_pinned: isPinned,
              timestamp: Date.now(),
            });
          },
        },
        async (ctx) =>
          TaskPlanner.generatePlan(
            ctx.connector,
            ctx.providerCfg,
            ctx.model.model_id,
            prompt,
            projectFiles,
            rules.effectiveRules || rules.universalRules,
            ctx.apiKey,
            this.planAbort?.signal,
            runId,
            availableAgents
          )
      );

    } catch (err: any) {
      if (err?.name === 'PoolExhaustedError') {
        // B2: pause at planning stage too; resolution replans after the user acts.
        await this.handlePoolExhausted(runId, err);
      } else {
        this.emitRunFailed(runId, err?.message || 'Planning failed', err?.name);
      }
      if (this.opts.taskRepo && this.activeSessionId) {
        try {
          this.opts.taskRepo.createTaskRun(
            runId,
            this.activeSessionId,
            prompt,
            err?.name === 'PoolExhaustedError' ? 'paused_pool_exhausted' : 'failed'
          );
        } catch { /* run row optional */ }
      }
      throw err;
    }

    if (this.opts.taskRepo && this.activeSessionId) {
      try {
        this.opts.taskRepo.createTaskRun(runId, this.activeSessionId, prompt, 'created');
      } catch {
        /* persistence must not block planning */
      }
    }

    this.pendingPlan = plan;
    this.opts.eventBus.emit({
      type: 'plan.proposed',
      plan,
      timestamp: Date.now(),
    });

    this.opts.eventBus.emit({
      type: 'approval.requested',
      approval_id: `appr_plan_${runId}`,
      run_id: runId,
      kind: 'plan',
      title: 'Implementation Plan Approval',
      description: `Plan proposed for goal: "${plan.goal}"`,
      details: { files_to_modify: plan.files_to_modify, assumptions: plan.assumptions },
      timestamp: Date.now(),
    });

    return plan;
  }

  public approvePlan(runId: string): void {
    if (!this.pendingPlan || this.pendingPlan.run_id !== runId) {
      throw new Error(`No pending plan matching run '${runId}'`);
    }

    // Issue PlanToken via PlanGate per FR-RUL-003
    // GAP-011: Never issue wildcard '*' if empty. Only explicitly approved files can be modified.
    const allowedFiles = this.pendingPlan.files_to_modify;
    this.opts.planGate.issueToken(runId, allowedFiles);

    if (this.opts.taskRepo) {
      try {
        this.opts.taskRepo.setPlanApproved(runId);
      } catch { /* non-fatal */ }
    }
  }

  public rejectPlan(runId: string, reason?: string): void {
    if (!this.pendingPlan || this.pendingPlan.run_id !== runId) {
      throw new Error(`No pending plan matching run '${runId}'`);
    }
    this.opts.planGate.revokeToken(runId);
    if (this.opts.taskRepo) {
      try {
        this.opts.taskRepo.setRunStatus(runId, 'rejected');
      } catch { /* non-fatal */ }
    }
    this.opts.eventBus.emit({
      type: 'log',
      level: 'info',
      message: `Plan rejected${reason ? `: ${reason}` : ''}`,
      context: { run_id: runId },
      timestamp: Date.now(),
    });
    this.pendingPlan = null;
  }

  /** Cancel the active run(s): aborts in-flight completions, marks nodes cancelled (FR-ORC-010). */
  public cancel(runId?: string): void {
    this.planAbort?.abort();
    if (runId && this.activeRunId && runId !== this.activeRunId) {
      const executor = this.activeExecutors.get(runId);
      executor?.cancel();
      return;
    }
    for (const executor of this.activeExecutors.values()) {
      executor.cancel();
    }
  }

  public isPaused(runId: string): boolean {
    return this.pausedRuns.has(runId);
  }

  public clearPause(runId: string): void {
    this.pausedRuns.delete(runId);
  }

  /**
   * After a pool-exhaustion resolution: returns null when the paused run can
   * resume via executeApprovedPlan, or a fresh plan when the pause happened
   * during planning (the caller then continues the normal approval flow).
   */
  public async resumeAfterExhaustion(runId: string): Promise<PlanProposal | null> {
    this.pausedRuns.delete(runId);
    if (this.pendingPlan && this.pendingPlan.run_id === runId) {
      return null; // exact paused run resumes through executeApprovedPlan
    }
    if (this.lastPrompt) {
      // Planning-stage pause: re-plan under the SAME run id so the original
      // run state/identity survives the resolution boundary (GAP-002).
      return this.startRun(this.lastPrompt.prompt, this.lastPrompt.options, runId);
    }
    return null;
  }

  /**
   * Issue the explicit PaidGrant for a pool-exhaustion resolution (GAP-002).
   * Callers MUST have obtained explicit user confirmation first; this method
   * never grants implicitly.
   */
  public authorizePaidForExhaustion(modelId?: string, confirmed = false): PaidGrant {
    if (!confirmed) {
      throw new Error(
        'Paid authorization requires explicit confirmation. Select the "add credit / recharge a paid-capable provider" action and confirm before a PaidGrant is created.'
      );
    }
    const paidModels = this.opts.registry.getModels().filter((m) => m.tier === 'paid');
    const target = modelId ? paidModels.find((m) => m.model_id === modelId) : paidModels[0];
    if (!target) {
      throw new Error(
        'No paid-capable model is registered. Connect a provider with paid models, then retry.'
      );
    }
    return this.opts.router.paidGate.issueGrant(
      target.provider_id,
      target.model_id,
      'pool_exhaustion_authorized'
    );
  }

  public getPendingPlan(runId?: string): PlanProposal | null {
    if (!this.pendingPlan) return null;
    if (runId && this.pendingPlan.run_id !== runId) return null;
    return this.pendingPlan;
  }

  // ---------------------------------------------------------------------------
  // Execution
  // ---------------------------------------------------------------------------

  public async executeApprovedPlan(
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
    this.onPermissionApproval = onPermissionApprovalRequired;
    if (!this.pendingPlan || this.pendingPlan.run_id !== runId) {
      throw new Error(`Plan for run '${runId}' has not been proposed`);
    }

    const startedAt = Date.now();
    this.pausedRuns.delete(runId);
    if (this.opts.taskRepo) {
      try {
        this.opts.taskRepo.setRunStatus(runId, 'running');
      } catch { /* non-fatal */ }
    }

    const rules = this.opts.rulesLoader.loadRules();

    // FR-RUL-005: unresolvable rule conflicts always pause for approval.
    const conflictCheck = StopConditions.checkRuleConflicts(rules.conflicts);
    if (conflictCheck.shouldStop) {
      this.opts.eventBus.emit({
        type: 'approval.requested',
        approval_id: `appr_conflict_${runId}`,
        run_id: runId,
        kind: 'permission',
        title: 'Rule Conflict Requires Resolution',
        description: conflictCheck.reason || 'Conflicting rules detected.',
        details: { conflicts: rules.conflicts },
        timestamp: Date.now(),
      });
      this.failRun(runId, conflictCheck.reason || 'Rule conflict detected', 'rule_conflict');
      throw new Error(conflictCheck.reason);
    }

    const executor = new DagExecutor(this.opts.eventBus);
    this.activeExecutors.set(runId, executor);

    let coderModelId: string | undefined;
    const maxFeedback = this.opts.maxFeedbackIterations ?? DEFAULT_MAX_FEEDBACK_ITERATIONS;
    let feedbackRounds = 0;

    const unsubStarted = this.opts.eventBus.on('node.started', (ev) => {
      if (ev.run_id === runId) this.persistNode(runId, ev.node);
    });
    const unsubFinished = this.opts.eventBus.on('node.finished', (ev) => {
      if (ev.run_id === runId) this.persistNode(runId, ev.node);
    });

    try {
      let execResult!: Awaited<ReturnType<DagExecutor['executeGraph']>>;

      feedbackLoop: while (true) {
        execResult = await executor.executeGraph(
          runId,
          this.pendingPlan.graph,
          async (node: TaskNode, signal: AbortSignal) => {
            const agentDef = this.resolveAgent(node.agent);
            const binding = this.resolveBinding(node.agent, agentDef);
            const pinned = binding && binding !== 'flappyauto' ? binding : undefined;

            const req = {
              taskType:
                node.agent === 'Coder'
                  ? ('coding' as const)
                  : node.agent === 'Reviewer'
                    ? ('review' as const)
                    : node.agent === 'Tester'
                      ? ('test' as const)
                      : node.agent === 'File-Finder' || node.agent === 'Codebase-Analyst'
                        ? ('search' as const)
                        : ('general' as const),
              minContext: 8192,
              tools: agentDef.allowed_tools.length > 0,
              vision: false,
            };

            await this.runAgentNode(node, agentDef, rules, {
              runId,
              signal,
              requirements: req,
              pinned,
              coderModelId,
              coderModelIdRef: (m) => {
                if (node.agent === 'Coder' && !coderModelId) coderModelId = m;
              },
            });
          }
        );

        if (execResult.cancelled) {
          throw new RunCancelledError();
        }

        // GAP-009: bounded Reviewer/Tester -> Coder feedback loop.
        const verdict = this.evaluateFeedback();
        if (verdict.failed && hasCoder(this.pendingPlan) && feedbackRounds < maxFeedback) {
          feedbackRounds++;
          const coderNode = this.pendingPlan.graph.nodes.find((n) => n.agent === 'Coder')!;
          this.nodeFeedback.set(coderNode.id, {
            iteration: feedbackRounds,
            from: verdict.from || 'Tester/Reviewer',
            text: verdict.feedback || '',
          });
          // GAP-009: structured feedback.iteration event for TUI observation.
          this.opts.eventBus.emit({
            type: 'feedback.iteration',
            run_id: runId,
            node_id: coderNode.id,
            agent: 'Coder',
            iteration: feedbackRounds,
            max_iterations: maxFeedback,
            from: verdict.from || 'Tester/Reviewer',
            feedback: (verdict.feedback || '').slice(0, 2000),
            timestamp: Date.now(),
          });
          this.opts.eventBus.emit({
            type: 'log',
            level: 'warn',
            message: `Feedback loop iteration ${feedbackRounds}/${maxFeedback}: ${verdict.from} reported failure; sending structured feedback to Coder.`,
            context: { run_id: runId, iteration: feedbackRounds, max: maxFeedback },
            timestamp: Date.now(),
          });
          this.resetForFeedback(this.pendingPlan.graph, coderNode.id, feedbackRounds);
          this.persistNode(runId, coderNode);
          continue;
        }
        if (verdict.failed && hasCoder(this.pendingPlan)) {
          this.opts.eventBus.emit({
            type: 'log',
            level: 'error',
            message: `Feedback loop escalated to the user after ${maxFeedback} iterations: ${verdict.feedback || 'verification still failing'}`,
            context: { run_id: runId, iterations: maxFeedback },
            timestamp: Date.now(),
          });
          throw new FeedbackLoopEscalatedError(
            `Feedback loop escalated after ${maxFeedback} iterations: ${verdict.from} still reports failure. Changes were NOT applied; review the working tree manually.`
          );
        }
        break feedbackLoop;
      }

      if (execResult.failed.length > 0) {
        const firstFail = execResult.failed[0];
        throw new Error(`Task node '${firstFail.agent}' failed: ${firstFail.error || 'Execution failed'}`);
      }
      if (execResult.completed.length < this.pendingPlan.graph.nodes.length) {
        throw new Error(
          `Execution incomplete: only ${execResult.completed.length} of ${this.pendingPlan.graph.nodes.length} nodes finished.`
        );
      }
      const hasCoderNode = this.pendingPlan.graph.nodes.some((n) => n.agent === 'Coder');
      if (hasCoderNode && this.stagedChanges.size === 0) {
        throw new Error(`Coder agent completed without staging changes. Check model output or tool calls.`);
      }

      // Check if staged file edits exist and require diff review
      if (this.stagedChanges.size > 0) {
        const diffs: FileDiff[] = [];
        const stopReasons: string[] = [];
        for (const [filePath, newContent] of this.stagedChanges.entries()) {
          const oldContent = this.opts.fsJail.exists(filePath)
            ? this.opts.fsJail.readFile(filePath)
            : null;
          diffs.push(DiffEngine.createUnifiedDiff(filePath, oldContent, newContent));

          // FR-RUL-005: surface migration/breaking-API stop conditions to the reviewer.
          const migration = StopConditions.checkMigration(newContent);
          if (migration.shouldStop && migration.reason) stopReasons.push(migration.reason);
          const apiChange = StopConditions.checkApiChange(oldContent, newContent, filePath);
          if (apiChange.shouldStop && apiChange.reason) stopReasons.push(apiChange.reason);
        }
        this.pendingDiffs = diffs;

        const diffProposal = {
          id: `diff_${runId}`,
          run_id: runId,
          diffs,
          summary: `Changes to ${diffs.length} file(s)`,
          timestamp: Date.now(),
        };

        this.opts.eventBus.emit({
          type: 'diff.ready',
          proposal: diffProposal,
          timestamp: Date.now(),
        });

        this.opts.eventBus.emit({
          type: 'approval.requested',
          approval_id: `appr_diff_${runId}`,
          run_id: runId,
          kind: 'diff',
          title: 'Diff Approval Required',
          description:
            `Review changes for ${diffs.map((d) => d.path).join(', ')}` +
            (stopReasons.length > 0 ? ` — STOP CONDITIONS: ${stopReasons.join(' | ')}` : ''),
          details: stopReasons.length > 0 ? { stop_conditions: stopReasons } : undefined,
          timestamp: Date.now(),
        });

        // GAP-010: default DENY — nothing is written without an approval callback
        // that explicitly approves (interactive prompt or headless --approve-plan).
        let approved = false;
        if (onDiffApprovalRequired) {
          approved = await onDiffApprovalRequired(diffProposal);
        }

        if (approved) {
          this.applyStagedDiffs(runId);
        } else {
          throw new Error('Diff approval denied by user. No changes were applied.');
        }
      }

      // Update documentation (Context.md and Changelog.md per Section 8.1 of RULES.md)
      const changedFiles = Array.from(this.stagedChanges.keys());
      this.opts.docsKeeper.recordChange({
        title: this.pendingPlan.goal,
        category: 'Dev',
        whatChanged:
          `Completed execution for: ${this.pendingPlan.goal}. Modified: ${changedFiles.join(', ') || 'None'}` +
          (execOpts.approvalProvenance === 'headless_flag'
            ? ' Plan approval granted headlessly via the explicit --approve-plan flag.'
            : ''),
        why: 'User requested coding task via FlappyCode flappyauto',
      });
      // GAP-014: keep Context.md current after every approved change set.
      this.opts.docsKeeper.updateContextSummary(
        'Current Status',
        `Last updated: ${new Date().toISOString()}\n\n- Run: ${runId}\n- Goal: ${this.pendingPlan.goal}\n- Files changed: ${changedFiles.join(', ') || 'None'}\n- Models used: ${Array.from(this.modelsUsed).join(', ') || 'None'}`
      );

      if (this.activeSessionId && this.opts.sessionRepo) {
        try {
          this.opts.sessionRepo.addMessage(
            this.activeSessionId,
            'assistant',
            `Completed: ${this.pendingPlan.goal} (files: ${changedFiles.join(', ') || 'none'})`
          );
          this.opts.sessionRepo.updateSessionSummary(
            this.activeSessionId,
            `Last run: ${this.pendingPlan.goal}`
          );
        } catch { /* non-fatal */ }
      }
      if (this.opts.taskRepo) {
        try {
          this.opts.taskRepo.setRunStatus(runId, 'completed');
        } catch { /* non-fatal */ }
      }

      this.opts.eventBus.emit({
        type: 'run.completed',
        run_id: runId,
        duration_ms: Date.now() - startedAt,
        nodes_completed: this.pendingPlan.graph.nodes.length,
        models_used: Array.from(this.modelsUsed),
        paid_calls: this.paidCallsCount,
        files_changed: changedFiles,
        summary: `Completed goal: ${this.pendingPlan.goal}`,
        timestamp: Date.now(),
      });
    } catch (err: any) {
      if (err?.name === 'PoolExhaustedError') {
        await this.handlePoolExhausted(runId, err);
        throw err;
      }
      if (err?.name === 'RunCancelledError') {
        if (this.opts.taskRepo) {
          try { this.opts.taskRepo.setRunStatus(runId, 'cancelled'); } catch { /* ignore */ }
        }
        // GAP-012: emit structured run.cancelled event with exit code 130.
        this.opts.eventBus.emit({
          type: 'run.cancelled',
          run_id: runId,
          reason: err.message || 'Run cancelled by user',
          exit_code: 130,
          timestamp: Date.now(),
        });
        throw err;
      }
      // Feedback escalation and ordinary node failures.
      this.failRun(
        runId,
        err?.message || 'Execution failed',
        err?.name === 'FeedbackLoopEscalatedError' ? 'feedback_escalated' : 'execution_failed'
      );
      throw err;
    } finally {
      unsubStarted();
      unsubFinished();
      this.activeExecutors.delete(runId);
    }
  }

  // ---------------------------------------------------------------------------
  // Agent node execution (multi-turn loop)
  // ---------------------------------------------------------------------------

  private async runAgentNode(
    node: TaskNode,
    agentDef: AgentDefinition,
    rules: ReturnType<RulesLoader['loadRules']>,
    ctx: {
      runId: string;
      signal: AbortSignal;
      requirements: FallbackExecuteOptions['requirements'];
      pinned?: string;
      coderModelId?: string;
      coderModelIdRef: (modelId: string) => void;
    }
  ): Promise<void> {
    const runId = ctx.runId;
    const prompt = PromptComposer.compose(agentDef, rules, {
      goal: node.description,
      projectPath: this.opts.projectRoot,
      summary: this.contextManager.getMemory('run_summary'),
    });

    let messages = this.nodeMessages.get(node.id);
    if (!messages) {
      messages = [
        { role: 'system', content: prompt },
        { role: 'user', content: node.description },
      ];
    }
    const feedbackEntry = this.nodeFeedback.get(node.id);
    if (feedbackEntry && this.appliedFeedback.get(node.id) !== feedbackEntry.iteration) {
      messages.push({
        role: 'user',
        content:
          `STRUCTURED FEEDBACK (iteration ${feedbackEntry.iteration}) from ${feedbackEntry.from}:\n` +
          `${feedbackEntry.text}\n\nPatch the code accordingly and re-run any verification as needed.`,
      });
      this.appliedFeedback.set(node.id, feedbackEntry.iteration);
      node.iterations = feedbackEntry.iteration;
    }

    const tools = this.buildToolDefs(agentDef);
    const pinDisabled = this.pinDisabledNodes.has(node.id);
    let modelSelectedEmitted = false;
    let turns = 0;

    while (turns < MAX_AGENT_TURNS) {
      if (ctx.signal.aborted) throw new RunCancelledError();

      const completion = await this.fallback.execute(
        {
          runId,
          nodeId: node.id,
          agent: node.agent,
          requirements: ctx.requirements,
          pinnedModelId: pinDisabled || this.pinDisabledNodes.has(node.id) ? undefined : ctx.pinned,
          pinnedFallbackPolicy: agentDef.fallback_policy,
          coderModelId: ctx.coderModelId,
          signal: ctx.signal,
          onModelUsed: (model, isPinned) => {
            this.modelsUsed.add(model.model_id);
            if (model.tier === 'paid') this.paidCallsCount++;
            if (!modelSelectedEmitted) {
              modelSelectedEmitted = true;
              if (!node.model_used) node.model_used = model.model_id;
              ctx.coderModelIdRef(model.model_id);
              this.opts.eventBus.emit({
                type: 'model.selected',
                run_id: runId,
                node_id: node.id,
                agent: node.agent,
                model,
                is_pinned: isPinned,
                timestamp: Date.now(),
              });
              this.persistNode(runId, node);
            }
            if (ctx.pinned && model.model_id !== ctx.pinned) {
              // Pinned model was bypassed (failure/fallback): don't re-ask next turn.
              this.pinDisabledNodes.add(node.id);
            }
          },
          onSubstitution: (from, to, reason) => {
            node.substitutions.push(`${from} -> ${to} (${reason})`);
            this.opts.eventBus.emit({
              type: 'log',
              level: 'warn',
              message: `Model substitution for [${node.agent}]: ${from} -> ${to} (${reason})`,
              context: { run_id: runId, node_id: node.id },
              timestamp: Date.now(),
            });
            this.persistNode(runId, node);
          },
          preFlight:
            ctx.requirements.tools
              ? async ({ model }) => {
                  // GAP-015: lazy tool-calling capability probe before first tool-role use.
                  const result = await this.opts.registry.probeModel(
                    model.provider_id,
                    model.model_id
                  );
                  return result.outcome === 'supported';
                }
              : undefined,
        },
        async (attemptCtx) => this.streamTurn(node, messages!, tools, attemptCtx, ctx.signal)
      );

      // Successful completion: advance the conversation.
      this.nodeOutputs.set(
        node.id,
        (this.nodeOutputs.get(node.id) || '') + completion.text
      );
      this.opts.usageRepo.recordUsage(
        completion.providerId,
        completion.modelId,
        completion.tokensIn,
        completion.tokensOut
      );

      if (completion.toolCalls.length === 0) {
        break;
      }

      const assistantMsg: ChatMessage = {
        role: 'assistant',
        content: completion.text || '',
        tool_calls: completion.toolCalls.map((tc) => ({
          id: tc.id,
          type: 'function' as const,
          function: { name: tc.name, arguments: tc.arguments },
        })),
      };
      messages.push(assistantMsg);

      for (const tc of completion.toolCalls) {
        const resultContent = await this.executeToolCall(node, agentDef, tc, runId, rules);
        messages.push({
          role: 'tool',
          content: resultContent,
          tool_call_id: tc.id,
          name: tc.name,
        });
      }

      turns++;

      // GAP-026: compact conversation near the context window instead of truncating silently.
      const modelContext = completion.contextLength || 32768;
      const slice = this.contextManager.buildContextSlice(node.description, messages, [], modelContext);
      if (slice.compacted) {
        messages = slice.turns;
        this.opts.eventBus.emit({
          type: 'log',
          level: 'info',
          message: `Context compacted for [${node.agent}] to conserve tokens (earlier turns summarized, not dropped).`,
          context: { run_id: runId, node_id: node.id },
          timestamp: Date.now(),
        });
      }
    }

    this.nodeMessages.set(node.id, messages);
  }

  /** One model completion turn through the fallback executor. */
  private async streamTurn(
    node: TaskNode,
    messages: ChatMessage[],
    tools: ToolDefinition[],
    attemptCtx: FallbackAttemptContext,
    signal: AbortSignal
  ): Promise<{
    text: string;
    toolCalls: ToolCallAssembled[];
    providerId: string;
    modelId: string;
    tokensIn: number;
    tokensOut: number;
    contextLength: number;
  }> {
    const req: CompletionRequest = {
      model: attemptCtx.model.model_id,
      messages,
      tools: tools.length > 0 ? tools : undefined,
      temperature: 0.1,
      signal,
    };

    let text = '';
    let tokensIn = 0;
    let tokensOut = 0;
    const assembledTools = new Map<number, ToolCallAssembled>();

    for await (const chunk of attemptCtx.connector.complete(attemptCtx.providerCfg, req, attemptCtx.apiKey)) {
      if (chunk.delta) text += chunk.delta;
      if (chunk.usage) {
        tokensIn = chunk.usage.tokens_in;
        tokensOut = chunk.usage.tokens_out;
      }
      if (chunk.tool_calls) {
        for (const tc of chunk.tool_calls) {
          const idx = tc.index ?? 0;
          if (!assembledTools.has(idx)) {
            assembledTools.set(idx, {
              id: tc.id || `tc_${Date.now()}_${idx}`,
              name: tc.function?.name || '',
              arguments: '',
            });
          }
          const item = assembledTools.get(idx)!;
          if (tc.id) item.id = tc.id;
          if (tc.function?.name) item.name = tc.function.name;
          if (tc.function?.arguments) item.arguments += tc.function.arguments;
        }
      }
    }

    void node;
    return {
      text,
      toolCalls: Array.from(assembledTools.values()),
      providerId: attemptCtx.providerCfg.id,
      modelId: attemptCtx.model.model_id,
      tokensIn: tokensIn || Math.ceil(messages.reduce((n, m) => n + m.content.length, 0) / 4),
      tokensOut: tokensOut || Math.ceil(text.length / 4),
      contextLength: attemptCtx.model.context_length,
    };
  }

  // ---------------------------------------------------------------------------
  // Tools
  // ---------------------------------------------------------------------------

  private buildToolDefs(agentDef: AgentDefinition): ToolDefinition[] {
    const defs: ToolDefinition[] = [];
    const has = (t: string) => agentDef.allowed_tools.includes(t);

    if (has('fs_read')) {
      defs.push({
        type: 'function',
        function: {
          name: 'read_file',
          description: 'Read contents of a project file',
          parameters: {
            type: 'object',
            properties: { path: { type: 'string' } },
            required: ['path'],
          },
        },
      });
    }
    if (has('fs_list')) {
      defs.push({
        type: 'function',
        function: {
          name: 'list_files',
          description: 'List project files in a directory',
          parameters: {
            type: 'object',
            properties: {
              directory: {
                type: 'string',
                description: 'Directory path relative to root, defaults to .',
              },
            },
          },
        },
      });
    }
    if (has('fs_write')) {
      defs.push({
        type: 'function',
        function: {
          name: 'write_file',
          description: 'Propose writing content to a project file',
          parameters: {
            type: 'object',
            properties: { path: { type: 'string' }, content: { type: 'string' } },
            required: ['path', 'content'],
          },
        },
      });
    }
    if (has('shell_exec')) {
      defs.push({
        type: 'function',
        function: {
          name: 'execute_command',
          description: 'Execute shell command',
          parameters: {
            type: 'object',
            properties: { command: { type: 'string' } },
            required: ['command'],
          },
        },
      });
    }
    if (has('search')) {
      defs.push({
        type: 'function',
        function: {
          name: 'search',
          description: 'Search project files for a plain-text or /regex/ query (project-root scoped)',
          parameters: {
            type: 'object',
            properties: {
              query: { type: 'string' },
              max_results: { type: 'number', description: 'Maximum matches to return (default 25)' },
            },
            required: ['query'],
          },
        },
      });
    }
    if (has('semantic_search')) {
      defs.push({
        type: 'function',
        function: {
          name: 'semantic_search',
          description: 'Search project files semantically/offline using BM25 indexing across code chunks',
          parameters: {
            type: 'object',
            properties: {
              query: { type: 'string', description: 'Search query describing code or feature' },
              limit: { type: 'number', description: 'Maximum matches to return (default 10)' },
            },
            required: ['query'],
          },
        },
      });
    }
    if (has('ask')) {
      defs.push({
        type: 'function',
        function: {
          name: 'ask_question',
          description: 'Ask the user a clarifying question when the task is ambiguous. Returns the user answer.',
          parameters: {
            type: 'object',
            properties: {
              question: { type: 'string' },
              options: { type: 'array', items: { type: 'string' }, description: 'Optional multiple-choice options' },
            },
            required: ['question'],
          },
        },
      });
    }
    return defs;
  }

  private sanitizePath(p: string): string {
    let clean = p.trim().replace(/^['"]|['"]$/g, '');
    if ((clean.startsWith('/') || clean.startsWith('\\')) && !/^[a-zA-Z]:[/\\]/.test(clean)) {
      clean = clean.replace(/^[/\\]+/, '');
    }
    return clean.replace(/^\.\//, '');
  }

  private parseToolArgs(rawArguments: string): any {
    try {
      return JSON.parse(rawArguments || '{}');
    } catch {
      const pathMatch = rawArguments.match(/"path"\s*:\s*"([^"]+)"/);
      const contentMatch = rawArguments.match(/"content"\s*:\s*"([\s\S]*)"/);
      if (pathMatch && contentMatch) {
        return {
          path: pathMatch[1],
          content: contentMatch[1].replace(/\\n/g, '\n').replace(/\\"/g, '"'),
        };
      }
      const generic: Record<string, string> = {};
      for (const m of rawArguments.matchAll(/"(\w+)"\s*:\s*"([^"]*)"/g)) {
        generic[m[1]] = m[2];
      }
      return Object.keys(generic).length > 0 ? generic : {};
    }
  }

  private recordToolCall(
    node: TaskNode,
    record: {
      id: string;
      tool: string;
      args: Record<string, any>;
      result_summary: string;
      approved_by_user: boolean;
    }
  ): void {
    const full = { ...record, timestamp: Date.now() };
    node.tool_calls.push(full);
    if (this.opts.auditRepo) {
      try {
        this.opts.auditRepo.logToolCall(node.id, full);
      } catch {
        /* audit failure must not execute anything twice */
      }
    }
  }

  /** Execute one assembled tool call and return model-visible result content. */
  private async executeToolCall(
    node: TaskNode,
    _agentDef: AgentDefinition,
    tc: ToolCallAssembled,
    runId: string,
    _rules: ReturnType<RulesLoader['loadRules']>
  ): Promise<string> {
    const args = this.parseToolArgs(tc.arguments);

    if (tc.name === 'write_file' && args.path && args.content !== undefined) {
      const cleanPath = this.sanitizePath(args.path);
      const isAuthorized = this.pendingPlan
        ? this.opts.planGate.validateOperation(this.pendingPlan.run_id, cleanPath)
        : false;

      if (!isAuthorized) {
        // GAP-011: Out-of-plan write MUST NOT expand token or stage change
        const blockedMsg = `PlanGate Blocked: Path '${cleanPath}' is outside the approved plan scope. Ask the user for approval before touching files outside the approved plan.`;
        this.recordToolCall(node, {
          id: tc.id,
          tool: 'write_file',
          args: { path: cleanPath },
          result_summary: blockedMsg,
          approved_by_user: false,
        });
        return blockedMsg;
      }

      this.stageChange(cleanPath, args.content);
      let stagedMsg = `Staged edit for ${cleanPath}`;

      // GAP-016: LSP diagnostics integration
      if (this.opts.lspClient) {
        try {
          await this.opts.lspClient.notifyChange(cleanPath, args.content, this.opts.projectRoot);
          const diags = await this.opts.lspClient.getDiagnostics(this.opts.projectRoot, cleanPath);
          if (diags.length > 0) {
            const diagSummary = diags
              .map(
                (d) =>
                  `[LSP ${d.severity.toUpperCase()}] Line ${d.line}: ${d.message}${
                    d.code ? ` (${d.code})` : ''
                  }`
              )
              .join('\n');
            stagedMsg += `\nLSP Diagnostics:\n${diagSummary}`;
          }
        } catch {
          // Graceful degradation per SI-003
        }
      }

      this.recordToolCall(node, {
        id: tc.id,
        tool: 'write_file',
        args: { path: cleanPath },
        result_summary: stagedMsg,
        approved_by_user: true,
      });
      return `${stagedMsg}. The change is staged and will be written after diff approval.`;
    }

    if (tc.name === 'read_file' && args.path) {
      const cleanPath = this.sanitizePath(args.path);
      let content = '';
      if (this.opts.fsJail.exists(cleanPath)) {
        try {
          content = this.opts.fsJail.readFile(cleanPath);
        } catch (err: any) {
          content = `Error reading file: ${err.message}`;
        }
      } else {
        content = `File '${cleanPath}' does not exist.`;
      }
      this.recordToolCall(node, {
        id: tc.id,
        tool: 'read_file',
        args: { path: cleanPath },
        result_summary:
          content.startsWith('File') || content.startsWith('Error')
            ? content
            : `Read ${content.length} chars`,
        approved_by_user: true,
      });
      return content.length > 20000 ? content.slice(0, 20000) + '\n...[truncated]' : content;
    }

    if (tc.name === 'list_files') {
      const dir = args.directory || '.';
      const files = this.opts.fsJail.listFiles(dir, false);
      this.recordToolCall(node, {
        id: tc.id,
        tool: 'list_files',
        args,
        result_summary: `Found ${files.length} items`,
        approved_by_user: true,
      });
      return JSON.stringify(files.slice(0, 200), null, 2);
    }

    if (tc.name === 'search' && args.query) {
      // GAP-019: search is exposed to agents; project-root scoped via FsJail.
      const max = typeof args.max_results === 'number' ? Math.min(100, args.max_results) : 25;
      const matches = this.opts.search.search(String(args.query), max);
      this.recordToolCall(node, {
        id: tc.id,
        tool: 'search',
        args: { query: args.query },
        result_summary: `${matches.length} match(es) for '${args.query}'`,
        approved_by_user: true,
      });
      if (matches.length === 0) {
        return `No matches for '${args.query}'.`;
      }
      return JSON.stringify(matches, null, 2);
    }

    if (tc.name === 'semantic_search' && args.query) {
      // P1-D8: Codebase-Analyst semantic search via BM25 chunk index
      const limit = typeof args.limit === 'number' ? Math.min(50, args.limit) : 10;
      let matches: any[] = [];
      if (this.opts.semanticIndex) {
        matches = this.opts.semanticIndex.search(String(args.query), limit);
      }
      this.recordToolCall(node, {
        id: tc.id,
        tool: 'semantic_search',
        args: { query: args.query, limit },
        result_summary: `${matches.length} semantic match(es) for '${args.query}'`,
        approved_by_user: true,
      });
      if (matches.length === 0) {
        return `No semantic matches for '${args.query}'.`;
      }
      return JSON.stringify(matches, null, 2);
    }

    if (tc.name === 'ask_question' && args.question) {
      // GAP-048: clarifying questions are a first-class interaction.
      const options = Array.isArray(args.options) && args.options.length > 0 ? args.options.map(String) : [];
      this.recordToolCall(node, {
        id: tc.id,
        tool: 'ask_question',
        args: { question: args.question },
        result_summary: 'Question posed to user',
        approved_by_user: true,
      });
      const answer = await this.askQuestion(runId, node.agent, String(args.question), options);
      return `User answer: ${answer}`;
    }

    if (tc.name === 'execute_command' && args.command) {
      let isApproved = false;
      const permDecision = this.opts.permissionEngine
        ? this.opts.permissionEngine.checkCommand(args.command)
        : { decision: 'ask' as const, isDestructive: false };

      if (permDecision.decision === 'allow') {
        isApproved = true;
      } else if (permDecision.decision === 'deny') {
        const deniedMsg = `Command denied by security policy: ${permDecision.reason || args.command}`;
        this.recordToolCall(node, {
          id: tc.id,
          tool: 'execute_command',
          args: { command: args.command },
          result_summary: deniedMsg,
          approved_by_user: false,
        });
        return deniedMsg;
      } else {
        const stopCheck = StopConditions.checkShellCommand(args.command);
        const isDestructive = stopCheck.shouldStop || permDecision.isDestructive;

        if (this.onPermissionApproval) {
          const userChoice = await this.onPermissionApproval({
            agent: node.agent,
            command: args.command,
            reason: permDecision.reason || stopCheck.reason,
            isDestructive,
          });
          if (userChoice === 'allow') {
            isApproved = true;
          } else if (userChoice === 'always' && !isDestructive && this.opts.permissionEngine) {
            this.opts.permissionEngine.allowCommandPattern(args.command);
            isApproved = true;
          }
        }
      }

      if (!isApproved) {
        const deniedMsg = `Command requires user approval and was not approved: ${args.command}`;
        this.recordToolCall(node, {
          id: tc.id,
          tool: 'execute_command',
          args: { command: args.command },
          result_summary: deniedMsg,
          approved_by_user: false,
        });
        return deniedMsg;
      }

      const res = await this.opts.shell.execute(args.command, { isUserApproved: true });
      const summary = `Exit ${res.exitCode}: ${res.stdout.slice(0, 100)}`;
      this.recordToolCall(node, {
        id: tc.id,
        tool: 'execute_command',
        args: { command: args.command },
        result_summary: summary,
        approved_by_user: true,
      });
      const parts = [`Exit code: ${res.exitCode}`];
      if (res.stdout) parts.push(`stdout:\n${res.stdout.slice(0, 4000)}`);
      if (res.stderr) parts.push(`stderr:\n${res.stderr.slice(0, 2000)}`);
      return parts.join('\n');
    }

    const unknownMsg = `Unknown or unsupported tool call '${tc.name}'. Available tools: read_file, list_files, write_file, execute_command, search, ask_question.`;
    this.recordToolCall(node, {
      id: tc.id,
      tool: tc.name,
      args,
      result_summary: unknownMsg,
      approved_by_user: false,
    });
    return unknownMsg;
  }

  // ---------------------------------------------------------------------------
  // Feedback evaluation (GAP-009)
  // ---------------------------------------------------------------------------

  private evaluateFeedback(): { failed: boolean; feedback?: string; from?: string } {
    if (!this.pendingPlan) return { failed: false };
    for (const node of this.pendingPlan.graph.nodes) {
      if (node.agent !== 'Tester' && node.agent !== 'Reviewer') continue;
      const text = this.nodeOutputs.get(node.id) || '';

      const failMatch = text.match(/VERDICT:\s*FAIL\b[:\-]?\s*([\s\S]*)/i);
      if (failMatch) {
        return {
          failed: true,
          from: node.agent,
          feedback: (failMatch[1].trim() || text.slice(0, 1500)).slice(0, 2000),
        };
      }
      if (/VERDICT:\s*PASS/i.test(text)) continue;

      // No explicit verdict: a Tester whose executed commands exited non-zero
      // is real failure evidence (never fabricated).
      if (node.agent === 'Tester') {
        const failing = node.tool_calls.find((tc) => /Exit\s+[1-9]\d*/.test(tc.result_summary || ''));
        if (failing) {
          return {
            failed: true,
            from: node.agent,
            feedback: `Command '${JSON.stringify(failing.args)}' failed: ${failing.result_summary}`,
          };
        }
      }
    }
    return { failed: false };
  }

  private resetForFeedback(graph: PlanProposal['graph'], coderNodeId: string, iteration: number): void {
    for (const n of graph.nodes) {
      if (n.id === coderNodeId || n.agent === 'Tester' || n.agent === 'Reviewer') {
        n.status = 'pending';
        n.started_at = undefined;
        n.ended_at = undefined;
        n.error = undefined;
        n.iterations = iteration;
        // Fresh verification output/conversation so an old FAIL verdict cannot
        // poison the next evaluation; the Coder keeps its conversation (plus
        // the new structured feedback message).
        this.nodeOutputs.delete(n.id);
        if (n.agent !== 'Coder') {
          this.nodeMessages.delete(n.id);
        }
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  public resolveAgent(name: string): AgentDefinition {
    return (
      this.opts.customAgents?.[name] ||
      BUILTIN_AGENTS[name] ||
      BUILTIN_AGENTS['Coder']
    );
  }

  public listAgents(): Record<string, AgentDefinition> {
    return { ...BUILTIN_AGENTS, ...(this.opts.customAgents || {}) };
  }

  private resolveBinding(agentName: string, agentDef: AgentDefinition): string {
    return this.opts.agentBindings?.[agentName] || agentDef.preferred_model_ref || 'flappyauto';
  }

  private persistNode(runId: string, node: TaskNode): void {
    if (!this.opts.taskRepo) return;
    try {
      this.opts.taskRepo.saveTaskNode(runId, { ...node, id: `${runId}:${node.id}` });
    } catch (err: any) {
      this.opts.eventBus.emit({
        type: 'log',
        level: 'warn',
        message: `Failed to persist node ${node.id}: ${err.message}`,
        context: { run_id: runId },
        timestamp: Date.now(),
      });
    }
  }

  private deriveStructuredError(error: string, reason?: string): StructuredError {
    const lower = error.toLowerCase();
    const reasonLower = (reason || '').toLowerCase();

    if (reasonLower === 'pool_exhausted' || lower.includes('pool is exhausted') || lower.includes('free model pool')) {
      return {
        code: ErrorCodes.POOL_EXHAUSTED,
        category: 'pool_exhausted',
        what: error,
        why: 'All eligible free-tier providers are exhausted, rate-limited, or unavailable.',
        next: 'Connect an additional free provider with "flappycode providers add" or authorize paid models.',
      };
    }

    if (reasonLower === 'feedback_escalated' || lower.includes('feedback loop escalated')) {
      return {
        code: ErrorCodes.FEEDBACK_ESCALATED,
        category: 'execution',
        what: error,
        why: 'The automated reviewer rejected successive iterations without resolution.',
        next: 'Refine your prompt to provide clearer constraints or simplify the requested changes.',
      };
    }

    if (reasonLower === 'rule_conflict' || lower.includes('rule conflict')) {
      return {
        code: ErrorCodes.PLANNER_FAILED,
        category: 'planner',
        what: error,
        why: 'Project rules conflict with each other or with system constraints.',
        next: 'Review and resolve conflicting rule files in .flappycode/rules.',
      };
    }

    if (lower.includes('without staging changes') || lower.includes('no changes were staged')) {
      return {
        code: ErrorCodes.EXECUTION_NO_CHANGES,
        category: 'execution',
        what: error,
        why: 'The model completed execution without modifying any tracked project files.',
        next: 'Clarify which files should be created or updated in your prompt.',
      };
    }

    if (lower.includes('diff approval denied') || lower.includes('diff rejected')) {
      return {
        code: ErrorCodes.DIFF_REJECTED,
        category: 'approval_required',
        what: error,
        why: 'The user or caller rejected the proposed diff review.',
        next: 'Adjust the prompt or accept the proposed changes when prompted.',
      };
    }

    if (lower.includes('plan approval denied') || lower.includes('plan rejected') || lower.includes('not approved')) {
      return {
        code: ErrorCodes.APPROVAL_REQUIRED,
        category: 'approval_required',
        what: error,
        why: 'The execution plan was not approved.',
        next: 'Pass --approve-plan in headless mode or approve the plan interactively in the TUI.',
      };
    }

    if (reasonLower === 'no_providers' || lower.includes('no providers') || lower.includes('no model')) {
      return {
        code: ErrorCodes.NO_PROVIDERS,
        category: 'provider',
        what: error,
        why: 'No active providers or models are available for this task.',
        next: 'Add a provider with "flappycode providers add" before starting a run.',
      };
    }

    return {
      code: ErrorCodes.EXECUTION_FAILED,
      category: 'execution',
      what: error,
      why: reason || undefined,
      next: 'Check the debug log with --debug for diagnostic details.',
    };
  }

  private emitRunFailed(runId: string, error: string, reason?: string, errorDetails?: StructuredError): void {
    if (this.emittedRunFailed.has(runId)) return;
    this.emittedRunFailed.add(runId);
    const details = errorDetails ?? this.deriveStructuredError(error, reason);
    this.opts.eventBus.emit({
      type: 'run.failed',
      run_id: runId,
      error,
      reason,
      error_details: details,
      timestamp: Date.now(),
    });
  }

  public failRun(runId: string, error: string, reason: string, errorDetails?: StructuredError): void {
    if (this.opts.taskRepo) {
      try { this.opts.taskRepo.setRunStatus(runId, 'failed'); } catch { /* ignore */ }
    }
    this.emitRunFailed(runId, error, reason, errorDetails);
  }

  /** GAP-002: persist the paused state and expose exactly two resolution actions. */
  private async handlePoolExhausted(runId: string, err: PoolExhaustedError): Promise<void> {
    this.pausedRuns.add(runId);
    if (this.opts.taskRepo) {
      try { this.opts.taskRepo.setRunStatus(runId, 'paused_pool_exhausted'); } catch { /* ignore */ }
    }
    this.opts.eventBus.emit({
      type: 'approval.requested',
      approval_id: `appr_pool_${runId}`,
      run_id: runId,
      kind: 'pool_exhausted',
      title: 'Free Model Pool Exhausted',
      description: err.message,
      details: {
        run_id: runId,
        actions: [
          { id: 'authorize_paid', label: 'Add credit / recharge a paid-capable provider' },
          { id: 'add_free_provider', label: 'Connect an additional free-tier provider' },
        ],
      },
      timestamp: Date.now(),
    });
    this.emitRunFailed(runId, err.message, 'pool_exhausted');
  }

  public applyStagedDiffs(runId: string): void {
    const affectedPaths = Array.from(this.stagedChanges.keys());
    // Record undo batch
    this.opts.undoEngine.recordBeforeChange(runId, affectedPaths);

    // Apply writes
    for (const [filePath, newContent] of this.stagedChanges.entries()) {
      this.opts.fsJail.writeFile(filePath, newContent, runId);
    }
  }

  public stageChange(filePath: string, content: string): void {
    this.stagedChanges.set(filePath, content);
  }

  public getStagedChanges(): Map<string, string> {
    return new Map(this.stagedChanges);
  }

  /** Update/insert a per-agent model binding at runtime (agents bind / pinModel). */
  public setAgentBinding(agentName: string, modelId: string): void {
    if (!this.opts.agentBindings) {
      this.opts.agentBindings = {};
    }
    this.opts.agentBindings[agentName] = modelId;
  }
}

function hasCoder(plan: PlanProposal): boolean {
  return plan.graph.nodes.some((n) => n.agent === 'Coder');
}
