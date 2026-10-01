import fs from 'node:fs';
import path from 'node:path';

export interface ChangeRecord {
  title: string;
  category?: 'Dev' | 'SEO' | 'UI' | 'Audit';
  whatChanged: string;
  why: string;
  bugFixed?: string;
  rootCause?: string;
}

export class DocsKeeper {
  constructor(private projectRoot: string) {}

  public recordChange(change: ChangeRecord): void {
    this.updateChangelog(change);
  }

  private updateChangelog(change: ChangeRecord): void {
    const changelogPath = path.join(this.projectRoot, 'Changelog.md');
    const now = new Date();
    const dateStr = now.toISOString().replace('T', ' ').slice(0, 16);
    const category = change.category || 'Dev';

    let entry = `\n## [${dateStr}]\n\n### [Category: ${category}] — ${change.title}\n`;
    entry += `What changed: ${change.whatChanged}\n`;
    entry += `Why: ${change.why}\n`;
    if (change.bugFixed) {
      entry += `Bug fixed: ${change.bugFixed}\n`;
    }
    if (change.rootCause) {
      entry += `Root cause: ${change.rootCause}\n`;
    }

    if (!fs.existsSync(changelogPath)) {
      fs.writeFileSync(changelogPath, `# FlappyCode — Changelog\n${entry}`, 'utf8');
    } else {
      const existing = fs.readFileSync(changelogPath, 'utf8');
      const lines = existing.split('\n');
      const firstHeadingIdx = lines.findIndex((l) => l.startsWith('## ['));
      if (firstHeadingIdx === -1) {
        fs.appendFileSync(changelogPath, entry, 'utf8');
      } else {
        const header = lines.slice(0, firstHeadingIdx).join('\n');
        const rest = lines.slice(firstHeadingIdx).join('\n');
        fs.writeFileSync(changelogPath, `${header}${entry}\n${rest}`, 'utf8');
      }
    }
  }

  public updateContextSummary(section: string, content: string): void {
    const contextPath = path.join(this.projectRoot, 'Context.md');
    if (!fs.existsSync(contextPath)) {
      fs.writeFileSync(
        contextPath,
        `# FlappyCode — Context\n\n## ${section}\n${content}\n`,
        'utf8'
      );
      return;
    }

    let existing = fs.readFileSync(contextPath, 'utf8');
    const sectionHeader = `## ${section}`;
    if (existing.includes(sectionHeader)) {
      // Replace existing section content up to next section or end
      const parts = existing.split(sectionHeader);
      const afterSection = parts[1];
      const nextSectionIdx = afterSection.indexOf('\n## ');
      const remainder = nextSectionIdx !== -1 ? afterSection.slice(nextSectionIdx) : '';
      existing = `${parts[0]}${sectionHeader}\n${content}\n${remainder}`;
    } else {
      existing += `\n${sectionHeader}\n${content}\n`;
    }
    fs.writeFileSync(contextPath, existing, 'utf8');
  }
}
