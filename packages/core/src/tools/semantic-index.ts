import path from 'node:path';
import { FsJail } from './fs-jail.js';
import { SecretGuard } from './secret-guard.js';
import { ISqliteDatabase } from '@flappycode/storage';

export interface SemanticSearchResult {
  file: string;
  startLine: number;
  endLine: number;
  score: number;
  preview: string;
}

const STOP_WORDS = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'by', 'for', 'from', 'has', 'he',
  'in', 'is', 'it', 'its', 'of', 'on', 'that', 'the', 'to', 'was', 'were',
  'will', 'with', 'const', 'let', 'var', 'function', 'return', 'import', 'export'
]);

function tokenize(text: string): string[] {
  const words = text
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .toLowerCase()
    .split(/[^a-z0-9_]+/);
  return words.filter((w) => w.length >= 2 && !STOP_WORDS.has(w));
}

/**
 * Offline-capable semantic index for Codebase-Analyst (P1-D8, FR-ORC-005).
 * Uses structured chunking + BM25 ranking to index code architecture and symbols.
 * Conforms strictly to FsJail boundaries and redacts secrets via SecretGuard.
 */
export class SemanticIndex {
  private secretGuard: SecretGuard;

  constructor(
    private fsJail: FsJail,
    private db: ISqliteDatabase
  ) {
    this.secretGuard = new SecretGuard();
    this.initTable();
  }

  private initTable(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS semantic_index_chunk (
        id TEXT PRIMARY KEY,
        file_path TEXT NOT NULL,
        chunk_index INTEGER NOT NULL,
        start_line INTEGER NOT NULL,
        end_line INTEGER NOT NULL,
        text TEXT NOT NULL,
        terms TEXT NOT NULL,
        token_count INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_semantic_chunk_file ON semantic_index_chunk(file_path);
    `);
  }

  public buildOrUpdate(force = false): { filesIndexed: number; chunksIndexed: number } {
    const files = this.fsJail.listFiles('.', true);
    let filesIndexed = 0;
    let chunksIndexed = 0;

    const binaryExts = new Set([
      '.png', '.jpg', '.jpeg', '.gif', '.ico', '.pdf', '.zip', '.tar', '.gz',
      '.exe', '.bin', '.db', '.sqlite', '.woff', '.woff2', '.lock'
    ]);

    for (const relFile of files) {
      const ext = path.extname(relFile).toLowerCase();
      if (binaryExts.has(ext)) continue;
      if (relFile.includes('node_modules') || relFile.includes('.git') || relFile.includes('dist')) continue;

      let content: string;
      try {
        content = this.fsJail.readFile(relFile);
      } catch {
        continue;
      }

      if (content.includes('\0')) continue;

      // Check if file is already up to date
      if (!force) {
        const existing = this.db.prepare('SELECT updated_at FROM semantic_index_chunk WHERE file_path = ? LIMIT 1').get(relFile) as any;
        if (existing) {
          // File already indexed
          continue;
        }
      }

      // Clear existing chunks for this file
      this.db.prepare('DELETE FROM semantic_index_chunk WHERE file_path = ?').run(relFile);

      // Redact sensitive secrets before indexing
      const safeContent = this.secretGuard.redact(content);
      const lines = safeContent.split('\n');
      const chunkSize = 40;
      const step = 30; // Overlapping chunks
      let chunkIdx = 0;

      for (let i = 0; i < lines.length; i += step) {
        const slice = lines.slice(i, i + chunkSize);
        if (slice.length === 0) break;

        const text = slice.join('\n');
        const tokens = tokenize(text);
        if (tokens.length === 0) continue;

        const id = `${relFile}:${chunkIdx}`;
        const startLine = i + 1;
        const endLine = i + slice.length;

        this.db.prepare(`
          INSERT INTO semantic_index_chunk (id, file_path, chunk_index, start_line, end_line, text, terms, token_count, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          id,
          relFile.replace(/\\/g, '/'),
          chunkIdx,
          startLine,
          endLine,
          text,
          JSON.stringify(tokens),
          tokens.length,
          Date.now()
        );

        chunkIdx++;
        chunksIndexed++;
      }

      filesIndexed++;
    }

    return { filesIndexed, chunksIndexed };
  }

  public buildIndex(force = false): number {
    return this.buildOrUpdate(force).filesIndexed;
  }

  public updateFile(relFile: string): void {
    const cleanPath = relFile.replace(/\\/g, '/');
    this.db.prepare('DELETE FROM semantic_index_chunk WHERE file_path = ?').run(cleanPath);
    let content: string;
    try {
      content = this.fsJail.readFile(cleanPath);
    } catch {
      return;
    }
    if (content.includes('\0')) return;
    const safeContent = this.secretGuard.redact(content);
    const lines = safeContent.split('\n');
    const chunkSize = 40;
    const step = 30;
    let chunkIdx = 0;
    for (let i = 0; i < lines.length; i += step) {
      const slice = lines.slice(i, i + chunkSize);
      if (slice.length === 0) break;
      const text = slice.join('\n');
      const tokens = tokenize(text);
      if (tokens.length === 0) continue;
      const id = `${cleanPath}:${chunkIdx}`;
      const startLine = i + 1;
      const endLine = i + slice.length;
      this.db.prepare(`
        INSERT INTO semantic_index_chunk (id, file_path, chunk_index, start_line, end_line, text, terms, token_count, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(id, cleanPath, chunkIdx, startLine, endLine, text, JSON.stringify(tokens), tokens.length, Date.now());
      chunkIdx++;
    }
  }

  public removeFile(relFile: string): void {
    const cleanPath = relFile.replace(/\\/g, '/');
    this.db.prepare('DELETE FROM semantic_index_chunk WHERE file_path = ?').run(cleanPath);
  }

  public search(searchQuery: string, limit = 10): SemanticSearchResult[] {
    return this.query(searchQuery, limit);
  }

  public query(searchQuery: string, limit = 10): SemanticSearchResult[] {
    const queryTokens = tokenize(searchQuery);
    if (queryTokens.length === 0) return [];

    const totalRow = this.db.prepare('SELECT COUNT(*) as count, AVG(token_count) as avgdl FROM semantic_index_chunk').get() as any;
    const N = totalRow?.count || 0;
    if (N === 0) return [];
    const avgdl = totalRow?.avgdl || 50;

    const rows = this.db.prepare('SELECT * FROM semantic_index_chunk').all() as any[];
    const scores: Array<{ row: any; score: number }> = [];

    const k1 = 1.2;
    const b = 0.75;

    for (const row of rows) {
      let terms: string[] = [];
      try {
        terms = JSON.parse(row.terms);
      } catch {
        continue;
      }

      const termCounts = new Map<string, number>();
      for (const t of terms) {
        termCounts.set(t, (termCounts.get(t) || 0) + 1);
      }

      let score = 0;
      const dl = row.token_count || terms.length;

      for (const q of queryTokens) {
        const tf = termCounts.get(q) || 0;
        if (tf > 0) {
          // Document frequency estimation for token
          const df = rows.filter((r) => r.terms.includes(`"${q}"`)).length || 1;
          const idf = Math.log((N - df + 0.5) / (df + 0.5) + 1);
          const num = tf * (k1 + 1);
          const denom = tf + k1 * (1 - b + b * (dl / avgdl));
          score += idf * (num / denom);
        }
      }

      if (score > 0) {
        scores.push({ row, score });
      }
    }

    scores.sort((a, b) => b.score - a.score);

    return scores.slice(0, limit).map(({ row, score }) => ({
      file: row.file_path,
      startLine: row.start_line,
      endLine: row.end_line,
      score: parseFloat(score.toFixed(3)),
      preview: row.text.slice(0, 200).trim(),
    }));
  }
}
