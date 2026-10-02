import fs from 'node:fs';
import path from 'node:path';
import { PlanGate } from '../rules/plan-gate.js';

export class FsJail {
  private canonicalRoot: string;

  constructor(
    private projectRoot: string,
    private planGate?: PlanGate
  ) {
    if (!fs.existsSync(projectRoot)) {
      fs.mkdirSync(projectRoot, { recursive: true });
    }
    this.canonicalRoot = path.resolve(fs.realpathSync.native ? fs.realpathSync.native(projectRoot) : fs.realpathSync(projectRoot));
  }

  public get root(): string {
    return this.canonicalRoot;
  }

  private isInsideRoot(candidate: string): boolean {
    const canonical = this.canonicalRoot;
    if (process.platform === 'win32') {
      const p = canonical.toLowerCase();
      const c = candidate.toLowerCase();
      const rel = path.relative(p, c);
      return !rel.startsWith('..') && !path.isAbsolute(rel) && (c === p || c.startsWith(p + path.sep));
    }
    const rel = path.relative(canonical, candidate);
    return !rel.startsWith('..') && !path.isAbsolute(rel) && (candidate === canonical || candidate.startsWith(canonical + path.sep));
  }

  public resolveSafePath(userPath: string): string {
    let cleanPath = userPath.trim().replace(/^['"]|['"]$/g, '');
    
    // If path has a leading slash without drive letter (e.g. /src/math.ts), treat as repo-relative
    if ((cleanPath.startsWith('/') || cleanPath.startsWith('\\')) && !/^[a-zA-Z]:[/\\]/.test(cleanPath)) {
      cleanPath = cleanPath.replace(/^[/\\]+/, '');
    }

    // Normalize relative vs absolute target
    let resolved: string;
    if (path.isAbsolute(cleanPath)) {
      resolved = path.normalize(cleanPath);
    } else {
      resolved = path.normalize(path.resolve(this.canonicalRoot, cleanPath));
    }

    // Path boundary check: candidate must be within canonicalRoot
    if (!this.isInsideRoot(resolved)) {
      throw new Error(`Security Violation: Path '${userPath}' escapes project root '${this.projectRoot}'`);
    }

    // Symlink escape check: verify closest existing ancestor (and target if existing)
    let probe = resolved;
    while (!fs.existsSync(probe)) {
      const parent = path.dirname(probe);
      if (parent === probe) break;
      probe = parent;
    }

    if (fs.existsSync(probe)) {
      try {
        const real = fs.realpathSync.native ? fs.realpathSync.native(probe) : fs.realpathSync(probe);
        if (!this.isInsideRoot(real)) {
          throw new Error(`Security Violation: Path '${userPath}' traverses symlink pointing outside project root`);
        }
      } catch (err: any) {
        if (err.message?.includes('Security Violation')) {
          throw err;
        }
      }
    }

    return resolved;
  }

  public readFile(relPath: string): string {
    const safePath = this.resolveSafePath(relPath);
    if (!fs.existsSync(safePath)) {
      throw new Error(`File not found: '${relPath}'`);
    }
    return fs.readFileSync(safePath, 'utf8');
  }

  public writeFile(relPath: string, content: string, runId?: string, isPrivileged = false): void {
    if (!isPrivileged && this.planGate && runId) {
      const allowed = this.planGate.validateOperation(runId, relPath);
      if (!allowed) {
        throw new Error(
          `PlanGate Blocked Write: No approved PlanToken authorizing write to '${relPath}' for run '${runId}'`
        );
      }
    } else if (!isPrivileged && this.planGate && !runId) {
      throw new Error(
        `PlanGate Blocked Write: Cannot write to '${relPath}' without an active run PlanToken`
      );
    }

    const safePath = this.resolveSafePath(relPath);
    const dir = path.dirname(safePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(safePath, content, 'utf8');
  }

  public deleteFile(relPath: string, runId?: string): void {
    if (this.planGate && runId) {
      const allowed = this.planGate.validateOperation(runId, relPath);
      if (!allowed) {
        throw new Error(
          `PlanGate Blocked Delete: No approved PlanToken authorizing delete for '${relPath}' in run '${runId}'`
        );
      }
    }

    const safePath = this.resolveSafePath(relPath);
    if (fs.existsSync(safePath)) {
      fs.unlinkSync(safePath);
    }
  }

  public listFiles(relDir = '.', recursive = true): string[] {
    const safeDir = this.resolveSafePath(relDir);
    const results: string[] = [];

    const walk = (current: string) => {
      const entries = fs.readdirSync(current, { withFileTypes: true });
      for (const entry of entries) {
        if (
          entry.name === '.git' ||
          entry.name === 'node_modules' ||
          entry.name === 'dist' ||
          entry.name === '.turbo'
        ) {
          continue;
        }
        const fullPath = path.join(current, entry.name);
        if (entry.isDirectory() && recursive) {
          walk(fullPath);
        } else if (entry.isFile()) {
          const rel = path.relative(this.projectRoot, fullPath);
          results.push(rel.replace(/\\/g, '/'));
        }
      }
    };

    if (fs.existsSync(safeDir)) {
      walk(safeDir);
    }
    return results;
  }

  public exists(relPath: string): boolean {
    try {
      const safePath = this.resolveSafePath(relPath);
      return fs.existsSync(safePath);
    } catch {
      return false;
    }
  }
}
