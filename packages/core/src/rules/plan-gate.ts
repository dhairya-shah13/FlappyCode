import fs from 'node:fs';
import path from 'node:path';
import { PlanToken } from '@flappycode/protocol';

export interface ScopeValidationResult {
  allowed: boolean;
  reason?: string;
  category?:
    | 'outside_jail'
    | 'protected_path'
    | 'rules_violation'
    | 'not_in_plan'
    | 'expired_token'
    | 'no_token';
}

export interface ScopeValidationContext {
  projectRoot?: string;
  userPrompt?: string;
  fileContent?: string;
  fsJail?: { root?: string; rootDir?: string; resolveSafePath?: (p: string) => string };
}

const PROTECTED_LOCKFILES = new Set([
  'package-lock.json',
  'pnpm-lock.yaml',
  'yarn.lock',
  'bun.lockb',
  'cargo.lock',
  'poetry.lock',
  'pipfile.lock',
  'composer.lock',
  'gemfile.lock',
]);

export class PlanGate {
  private activeTokens = new Map<string, PlanToken>(); // run_id -> PlanToken

  public issueToken(
    runId: string,
    allowedFiles: string[],
    ttlMs = 3600000,
    scopeMode: 'explicit' | 'single-model' = 'explicit',
    userPrompt?: string
  ): PlanToken {
    const token: PlanToken = {
      token: `token_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      run_id: runId,
      allowed_files: allowedFiles,
      issued_at: Date.now(),
      expires_at: Date.now() + ttlMs,
      scope_mode: scopeMode,
      scopeMode: scopeMode,
      user_prompt: userPrompt,
    };
    this.activeTokens.set(runId, token);
    return token;
  }

  public getToken(runId: string): PlanToken | undefined {
    return this.activeTokens.get(runId);
  }

  public createToken(
    runId: string,
    plan: { files_to_modify?: string[]; files_to_create?: string[]; assumptions?: string[]; goal?: string },
    ttlMs = 3600000
  ): PlanToken {
    const files = [...(plan.files_to_modify || []), ...(plan.files_to_create || [])];
    const isSingleModel = (plan.assumptions || []).some((a) => a.toLowerCase().includes('single-model'));
    const scopeMode = isSingleModel ? 'single-model' : 'explicit';
    return this.issueToken(runId, files, ttlMs, scopeMode, plan.goal);
  }

  public validateScope(
    tokenOrRunId: PlanToken | string,
    filePath: string,
    context?: ScopeValidationContext
  ): ScopeValidationResult {
    let token: PlanToken | undefined;
    if (typeof tokenOrRunId === 'string') {
      token = this.activeTokens.get(tokenOrRunId);
    } else {
      token = tokenOrRunId;
    }

    if (!token) {
      return {
        allowed: false,
        category: 'no_token',
        reason: `PlanGate Blocked: Cannot write to '${filePath}' without an active approved PlanToken`,
      };
    }

    if (token.expires_at < Date.now()) {
      if (typeof tokenOrRunId === 'string') {
        this.activeTokens.delete(tokenOrRunId);
      }
      return {
        allowed: false,
        category: 'expired_token',
        reason: `PlanGate Blocked: PlanToken has expired for run '${token.run_id}'`,
      };
    }

    const scopeMode = token.scope_mode || (token as any).scopeMode || 'explicit';

    // 1. Explicit Scope Mode (Multi-agent planner flow)
    if (scopeMode === 'explicit') {
      if (token.allowed_files.includes('*')) {
        return { allowed: true };
      }
      const clean = filePath.replace(/^[/\\]+/, '').replace(/^\.[/\\]/, '').replace(/\\/g, '/');
      const inPlan = token.allowed_files.some((af) => {
        const cleanAf = af.replace(/^[/\\]+/, '').replace(/^\.[/\\]/, '').replace(/\\/g, '/');
        return cleanAf === clean || clean.endsWith('/' + cleanAf) || cleanAf.endsWith('/' + clean);
      });
      if (!inPlan) {
        return {
          allowed: false,
          category: 'not_in_plan',
          reason: `PlanGate Blocked: Path '${filePath}' is outside the approved plan scope [${token.allowed_files.join(', ')}]`,
        };
      }
      return { allowed: true };
    }

    // 2. Single-Model Scope Mode
    const root = path.resolve(context?.projectRoot || context?.fsJail?.root || context?.fsJail?.rootDir || process.cwd());
    let canonicalRoot = root;
    try {
      if (fs.existsSync(root)) {
        canonicalRoot = fs.realpathSync(root);
      }
    } catch {}

    // Check canonical jail boundary
    let canonicalTarget: string;
    const resolved = path.isAbsolute(filePath) ? path.resolve(filePath) : path.resolve(root, filePath);
    try {
      if (fs.existsSync(resolved)) {
        canonicalTarget = fs.realpathSync(resolved);
      } else {
        let ancestor = path.dirname(resolved);
        while (!fs.existsSync(ancestor) && ancestor !== path.dirname(ancestor)) {
          ancestor = path.dirname(ancestor);
        }
        if (fs.existsSync(ancestor)) {
          const canonicalAncestor = fs.realpathSync(ancestor);
          canonicalTarget = path.join(canonicalAncestor, path.relative(ancestor, resolved));
        } else {
          canonicalTarget = resolved;
        }
      }
    } catch {
      canonicalTarget = resolved;
    }

    // Check FsJail root boundary
    const normRoot = path.normalize(canonicalRoot).toLowerCase();
    const normTarget = path.normalize(canonicalTarget).toLowerCase();
    const isInside = normTarget === normRoot || normTarget.startsWith(normRoot + (normRoot.endsWith(path.sep) ? '' : path.sep));
    if (!isInside) {
      return {
        allowed: false,
        category: 'outside_jail',
        reason: `PlanGate Blocked: Path '${filePath}' resolves outside filesystem jail boundary`,
      };
    }

    // Check relative normalized path for protected resources
    const relFromRoot = path.relative(canonicalRoot, canonicalTarget).replace(/\\/g, '/').replace(/^\/+/, '');
    const lowerRel = relFromRoot.toLowerCase();
    const fileName = path.basename(lowerRel);

    // Protected set 1: .git/**
    if (lowerRel === '.git' || lowerRel.startsWith('.git/')) {
      return {
        allowed: false,
        category: 'protected_path',
        reason: `PlanGate Blocked: Path '${filePath}' is in protected directory '.git'`,
      };
    }

    // Protected set 2: .env*
    if (fileName === '.env' || fileName.startsWith('.env.') || fileName.startsWith('.env')) {
      return {
        allowed: false,
        category: 'protected_path',
        reason: `PlanGate Blocked: Path '${filePath}' is a protected environment/secret file`,
      };
    }

    // Protected set 3: **/node_modules/**
    if (lowerRel === 'node_modules' || lowerRel.startsWith('node_modules/') || lowerRel.includes('/node_modules/')) {
      return {
        allowed: false,
        category: 'protected_path',
        reason: `PlanGate Blocked: Path '${filePath}' is inside protected directory 'node_modules'`,
      };
    }

    // Protected set 4: RULES.md and rules category files
    if (
      fileName === 'rules.md' ||
      lowerRel.startsWith('rules/') ||
      lowerRel.includes('/rules/') ||
      lowerRel.startsWith('.flappycode/rules/') ||
      lowerRel.startsWith('assets/rules/')
    ) {
      return {
        allowed: false,
        category: 'protected_path',
        reason: `PlanGate Blocked: Path '${filePath}' is a protected rules configuration file`,
      };
    }

    // Protected set 5: .flappycode/**
    if (lowerRel === '.flappycode' || lowerRel.startsWith('.flappycode/')) {
      return {
        allowed: false,
        category: 'protected_path',
        reason: `PlanGate Blocked: Path '${filePath}' is inside protected directory '.flappycode'`,
      };
    }

    // Protected set 6: lockfiles unless named explicitly in prompt
    if (PROTECTED_LOCKFILES.has(fileName)) {
      const promptText = (token.user_prompt || context?.userPrompt || '').toLowerCase();
      if (!promptText.includes(fileName)) {
        return {
          allowed: false,
          category: 'protected_path',
          reason: `PlanGate Blocked: Path '${filePath}' is a protected lockfile and was not explicitly requested in prompt`,
        };
      }
    }

    return { allowed: true };
  }

  public validateOperation(runId: string, filePath: string, context?: ScopeValidationContext): boolean {
    return this.validateScope(runId, filePath, context).allowed;
  }

  public revokeToken(runId: string): void {
    this.activeTokens.delete(runId);
  }

  public clear(): void {
    this.activeTokens.clear();
  }
}
