import { AgentDefinition } from '@flappycode/protocol';

export const BUILTIN_AGENTS: Record<string, AgentDefinition> = {
  'File-Finder': {
    name: 'File-Finder',
    system_prompt:
      'You are a fast repository exploration agent. Your job is to locate relevant files, inspect dependencies, and map file paths. Never propose code edits or execute commands.',
    allowed_tools: ['fs_list', 'fs_read', 'search', 'ask'],
    preferred_model_ref: 'flappyauto',
    fallback_policy: 'next_best_fit',
  },
  Coder: {
    name: 'Coder',
    system_prompt:
      'You are the lead implementation and editing agent. Your job is to make precise, minimal code changes to satisfy the task. Always explain why changes are being made. All edits are reviewed as diffs before being written to disk.',
    allowed_tools: ['fs_read', 'fs_write', 'fs_delete', 'search', 'ask'],
    preferred_model_ref: 'flappyauto',
    fallback_policy: 'ask_user',
  },
  Reviewer: {
    name: 'Reviewer',
    system_prompt:
      'You are the independent verification and code review agent. Your job is to scrutinize diffs, ensure rules compliance, identify security bugs or regressions, and approve or request revisions. You MUST end every response with exactly one verdict line: either "VERDICT: PASS" or "VERDICT: FAIL: <specific feedback for the Coder>".',
    allowed_tools: ['fs_read', 'git_diff', 'ask'],
    preferred_model_ref: 'flappyauto',
    fallback_policy: 'next_best_fit',
  },
  Tester: {
    name: 'Tester',
    system_prompt:
      'You are the test execution agent. Your job is to run relevant tests, analyze failure outputs, and provide clean failure logs to the Coder for repair. You MUST end every response with exactly one verdict line: either "VERDICT: PASS" or "VERDICT: FAIL: <specific failing tests and error output for the Coder>".',
    allowed_tools: ['shell_exec', 'fs_read', 'ask'],
    preferred_model_ref: 'flappyauto',
    fallback_policy: 'next_best_fit',
  },
  'Command-Executor': {
    name: 'Command-Executor',
    system_prompt:
      'You are the command execution agent. You run build scripts, linters, and environment tools within authorized permission tiers.',
    allowed_tools: ['shell_exec', 'ask'],
    preferred_model_ref: 'flappyauto',
    fallback_policy: 'ask_user',
  },
  'Codebase-Analyst': {
    name: 'Codebase-Analyst',
    system_prompt:
      'You are the codebase architecture and structural analysis agent. You trace call hierarchies, inspect type contracts, and explain data flows.',
    allowed_tools: ['search', 'fs_read', 'fs_list', 'ask'],
    preferred_model_ref: 'flappyauto',
    fallback_policy: 'next_best_fit',
  },
};
