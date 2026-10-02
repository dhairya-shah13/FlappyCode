import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { DocsKeeper } from '../../packages/core/src/rules/docs-keeper.js';

describe('DocsKeeper', () => {
  let tempDir: string;
  let docsKeeper: DocsKeeper;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'flappy-docs-'));
    docsKeeper = new DocsKeeper(tempDir);
  });

  afterEach(() => {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  it('creates Changelog.md if it does not exist', () => {
    docsKeeper.recordChange({
      title: 'Initial setup',
      whatChanged: 'Added base configs',
      why: 'Bootstrap repo',
    });

    const changelogPath = path.join(tempDir, 'Changelog.md');
    expect(fs.existsSync(changelogPath)).toBe(true);
    const content = fs.readFileSync(changelogPath, 'utf8');
    expect(content).toContain('# FlappyCode — Changelog');
    expect(content).toContain('[Category: Dev] — Initial setup');
    expect(content).toContain('What changed: Added base configs');
    expect(content).toContain('Why: Bootstrap repo');
  });

  it('prepends new entries in reverse chronological order when headings exist', () => {
    const changelogPath = path.join(tempDir, 'Changelog.md');
    fs.writeFileSync(
      changelogPath,
      '# FlappyCode — Changelog\n\n## [2026-10-01 10:00]\n\n### [Category: Dev] — First change\nWhat changed: first\nWhy: initial\n'
    );

    docsKeeper.recordChange({
      title: 'Second change',
      category: 'UI',
      whatChanged: 'Added buttons',
      why: 'User request',
      bugFixed: 'Button missing',
      rootCause: 'Omission in template',
    });

    const content = fs.readFileSync(changelogPath, 'utf8');
    const firstIdx = content.indexOf('Second change');
    const secondIdx = content.indexOf('First change');
    expect(firstIdx).toBeGreaterThan(-1);
    expect(secondIdx).toBeGreaterThan(-1);
    expect(firstIdx).toBeLessThan(secondIdx);
    expect(content).toContain('Bug fixed: Button missing');
    expect(content).toContain('Root cause: Omission in template');
    expect(content).toContain('[Category: UI]');
  });

  it('appends entry when Changelog exists without ## [ headings', () => {
    const changelogPath = path.join(tempDir, 'Changelog.md');
    fs.writeFileSync(changelogPath, '# Custom Changelog Title\n\nSome introductory text\n');

    docsKeeper.recordChange({
      title: 'New Feature',
      category: 'Audit',
      whatChanged: 'Audit tools',
      why: 'Audit requirement',
    });

    const content = fs.readFileSync(changelogPath, 'utf8');
    expect(content).toContain('# Custom Changelog Title');
    expect(content).toContain('[Category: Audit] — New Feature');
  });

  it('creates Context.md if it does not exist', () => {
    docsKeeper.updateContextSummary('Current State', 'Phase 1 development active.');

    const contextPath = path.join(tempDir, 'Context.md');
    expect(fs.existsSync(contextPath)).toBe(true);
    const content = fs.readFileSync(contextPath, 'utf8');
    expect(content).toContain('# FlappyCode — Context');
    expect(content).toContain('## Current State\nPhase 1 development active.');
  });

  it('appends new section to Context.md if section does not exist', () => {
    const contextPath = path.join(tempDir, 'Context.md');
    fs.writeFileSync(contextPath, '# FlappyCode — Context\n\n## Overview\nProject overview.\n');

    docsKeeper.updateContextSummary('Decisions', 'Use SQLite for persistence.');

    const content = fs.readFileSync(contextPath, 'utf8');
    expect(content).toContain('## Overview\nProject overview.');
    expect(content).toContain('## Decisions\nUse SQLite for persistence.');
  });

  it('replaces existing section while preserving following sections', () => {
    const contextPath = path.join(tempDir, 'Context.md');
    fs.writeFileSync(
      contextPath,
      '# FlappyCode — Context\n\n## Section A\nOld content A\n\n## Section B\nContent B\n'
    );

    docsKeeper.updateContextSummary('Section A', 'Updated content A');

    const content = fs.readFileSync(contextPath, 'utf8');
    expect(content).toContain('## Section A\nUpdated content A');
    expect(content).not.toContain('Old content A');
    expect(content).toContain('## Section B\nContent B');
  });
});
