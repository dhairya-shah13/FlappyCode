import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { FsJail } from './fs-jail.js';

export interface SearchMatch {
  file: string;
  line: number;
  content: string;
}

export interface SearchOptions {
  caseSensitive?: boolean;
  isRegex?: boolean;
  maxResults?: number;
  globs?: string[];
}

export class SearchTool {
  private rgAvailable: boolean | null = null;

  constructor(
    private fsJail: FsJail,
    private customSpawn?: typeof spawnSync
  ) {}

  public isRgAvailable(): boolean {
    if (this.customSpawn) {
      try {
        const res = this.customSpawn('rg', ['--version'], { encoding: 'utf8', stdio: 'pipe' });
        return !res.error && res.status === 0;
      } catch {
        return false;
      }
    }
    if (this.rgAvailable !== null) return this.rgAvailable;
    try {
      const res = spawnSync('rg', ['--version'], { encoding: 'utf8', stdio: 'pipe' });
      this.rgAvailable = !res.error && res.status === 0;
    } catch {
      this.rgAvailable = false;
    }
    return this.rgAvailable;
  }

  public search(query: string, maxResults = 50, options: SearchOptions = {}): SearchMatch[] {
    if (!query || query.trim() === '') return [];
    const limit = Math.min(1000, options.maxResults ?? maxResults);

    // Try ripgrep path first if available
    if (this.isRgAvailable()) {
      try {
        const rgMatches = this.searchWithRg(query, limit, options);
        if (rgMatches !== null) return rgMatches;
      } catch {
        // Fall back to pure JS
      }
    }

    return this.searchWithJs(query, limit, options);
  }

  public searchWithRg(query: string, maxResults: number, options: SearchOptions): SearchMatch[] | null {
    const spawner = this.customSpawn || spawnSync;
    const args = ['--json', '--max-count', String(maxResults)];

    if (!options.caseSensitive) {
      args.push('-i');
    }
    if (!options.isRegex && !query.startsWith('/')) {
      args.push('-F');
    }

    let pattern = query;
    if (pattern.startsWith('/') && pattern.endsWith('/')) {
      pattern = pattern.slice(1, -1);
    }
    args.push(pattern);
    args.push('.');

    const res = spawner('rg', args, {
      cwd: this.fsJail.root,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 5000,
    });

    if (res.error || (res.status !== null && res.status > 1)) {
      return null;
    }

    const matches: SearchMatch[] = [];
    const lines = (res.stdout || '').split('\n');
    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const item = JSON.parse(line);
        if (item.type === 'match') {
          const fileRaw = item.data.path.text;
          const normalizedPath = fileRaw.replace(/\\/g, '/').replace(/^\.\//, '');
          matches.push({
            file: normalizedPath,
            line: item.data.line_number,
            content: (item.data.lines.text || '').trimEnd(),
          });
          if (matches.length >= maxResults) break;
        }
      } catch {
        continue;
      }
    }
    return matches;
  }

  public searchWithJs(query: string, maxResults: number, options: SearchOptions = {}): SearchMatch[] {
    const files = this.fsJail.listFiles('.', true);
    const matches: SearchMatch[] = [];

    const isExplicitRegex = options.isRegex || (query.startsWith('/') && query.endsWith('/'));
    let regex: RegExp | null = null;
    if (isExplicitRegex) {
      const pattern = query.startsWith('/') && query.endsWith('/') ? query.slice(1, -1) : query;
      try {
        regex = new RegExp(pattern, options.caseSensitive ? '' : 'i');
      } catch {
        return [];
      }
    }

    const binaryExtensions = new Set([
      '.png',
      '.jpg',
      '.jpeg',
      '.gif',
      '.ico',
      '.pdf',
      '.zip',
      '.tar',
      '.gz',
      '.exe',
      '.dll',
      '.so',
      '.dylib',
      '.bin',
      '.db',
      '.sqlite',
      '.woff',
      '.woff2',
    ]);

    for (const file of files) {
      if (matches.length >= maxResults) break;
      const ext = path.extname(file).toLowerCase();
      if (binaryExtensions.has(ext)) continue;

      try {
        const content = this.fsJail.readFile(file);
        if (content.includes('\0')) continue;

        const lines = content.split('\n');
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          let matched = false;

          if (regex) {
            matched = regex.test(line);
          } else if (options.caseSensitive) {
            matched = line.includes(query);
          } else {
            matched = line.toLowerCase().includes(query.toLowerCase());
          }

          if (matched) {
            matches.push({
              file: file.replace(/\\/g, '/').replace(/^\.\//, ''),
              line: i + 1,
              content: line.trim(),
            });
            if (matches.length >= maxResults) break;
          }
        }
      } catch {
        // Skip unreadable files
      }
    }

    return matches;
  }
}
