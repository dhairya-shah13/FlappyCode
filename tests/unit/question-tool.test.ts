import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { FlappyEngine } from '@flappycode/core';
import { MockProviderConnector } from '@flappycode/providers';

describe('Clarifying Questions Tool & Lifecycle (GAP-048)', () => {
  let tmpDir: string;
  let engine: FlappyEngine;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'flappy-question-test-'));
    engine = new FlappyEngine({
      projectRoot: tmpDir,
      dbPath: path.join(tmpDir, 'test.db'),
      disableScheduler: true,
    });
  });

  afterEach(() => {
    engine.close();
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      // Ignore
    }
  });

  it('emits question.asked and pauses execution until answered', async () => {
    let questionAskedEvent: any = null;
    let questionAnsweredEvent: any = null;

    engine.eventBus.on('question.asked', (ev) => {
      questionAskedEvent = ev;
    });

    engine.eventBus.on('question.answered', (ev) => {
      questionAnsweredEvent = ev;
    });

    const questionPromise = engine.orchestrator.askQuestion(
      'run_123',
      'Coder',
      'Should we use JWT or session cookies?',
      ['JWT', 'Session cookies']
    );

    // Verify question.asked is emitted synchronously
    expect(questionAskedEvent).not.toBeNull();
    expect(questionAskedEvent.type).toBe('question.asked');
    expect(questionAskedEvent.question).toBe('Should we use JWT or session cookies?');
    expect(questionAskedEvent.options).toEqual(['JWT', 'Session cookies']);
    expect(questionAskedEvent.agent).toBe('Coder');

    const questionId = questionAskedEvent.question_id;
    expect(engine.orchestrator.hasPendingQuestion(questionId)).toBe(true);

    // Answer the question
    const ok = engine.answerQuestion(questionId, 'JWT');
    expect(ok).toBe(true);

    const receivedAnswer = await questionPromise;
    expect(receivedAnswer).toBe('JWT');

    // Verify question.answered event was emitted
    expect(questionAnsweredEvent).not.toBeNull();
    expect(questionAnsweredEvent.type).toBe('question.answered');
    expect(questionAnsweredEvent.answer).toBe('JWT');
    expect(questionAnsweredEvent.question_id).toBe(questionId);

    // Verify question is no longer pending
    expect(engine.orchestrator.hasPendingQuestion(questionId)).toBe(false);
  });

  it('drives answers via interactive askUser handler if installed', async () => {
    let handlerCalled = false;
    engine.setAskUser(async (req) => {
      handlerCalled = true;
      expect(req.question).toContain('color theme');
      return 'dark';
    });

    const answer = await engine.orchestrator.askQuestion(
      'run_456',
      'Reviewer',
      'What color theme should be default?',
      ['light', 'dark']
    );

    expect(handlerCalled).toBe(true);
    expect(answer).toBe('dark');
  });

  it('does not allow a stale or invalid questionId to resolve a question', () => {
    const ok = engine.answerQuestion('invalid_id_999', 'something');
    expect(ok).toBe(false);
  });

  it('resolves deterministically in headless mode when no askUser is registered', async () => {
    // No askUser registered
    engine.setAskUser(undefined);

    const answer = await engine.orchestrator.askQuestion(
      'run_headless',
      'File-Finder',
      'Proceed with deep search?',
      ['yes', 'no']
    );

    // Headless mode deterministically picks default choice (options[0])
    expect(answer).toBe('yes');
  });
});
