import { FsJail } from './fs-jail.js';

export interface SearchMatch {
  file: string;
  line: number;
  content: string;
}

export class SearchTool {
  constructor(private fsJail: FsJail) {}

  public search(query: string, maxResults = 50): SearchMatch[] {
    const files = this.fsJail.listFiles('.', true);
    const matches: SearchMatch[] = [];
    const isRegex = query.startsWith('/') && query.endsWith('/');
    const regex = isRegex ? new RegExp(query.slice(1, -1), 'i') : null;

    for (const file of files) {
      if (matches.length >= maxResults) break;
      try {
        const content = this.fsJail.readFile(file);
        const lines = content.split('\n');
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          const matched = regex ? regex.test(line) : line.toLowerCase().includes(query.toLowerCase());
          if (matched) {
            matches.push({
              file,
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
