import { z } from 'zod';

export const TaskNodeStatusSchema = z.enum([
  'pending',
  'running',
  'completed',
  'failed',
  'skipped',
  'waiting_approval',
  'cancelled',
]);
export type TaskNodeStatus = z.infer<typeof TaskNodeStatusSchema>;

export const ToolCallRecordSchema = z.object({
  id: z.string(),
  tool: z.string(),
  args: z.record(z.any()),
  result_summary: z.string().optional(),
  approved_by_user: z.boolean().default(false),
  timestamp: z.number().int(),
});
export type ToolCallRecord = z.infer<typeof ToolCallRecordSchema>;

export const TaskNodeSchema = z.object({
  id: z.string(),
  agent: z.string(),
  description: z.string(),
  depends_on: z.array(z.string()).default([]),
  status: TaskNodeStatusSchema.default('pending'),
  model_used: z.string().optional(),
  substitutions: z.array(z.string()).default([]),
  tool_calls: z.array(ToolCallRecordSchema).default([]),
  started_at: z.number().int().optional(),
  ended_at: z.number().int().optional(),
  error: z.string().optional(),
  /** Feedback-loop iteration count (FR-ORC-008); persists across retries. */
  iterations: z.number().int().nonnegative().default(0),
});
export type TaskNode = z.infer<typeof TaskNodeSchema>;

export const TaskGraphSchema = z.object({
  id: z.string(),
  goal: z.string(),
  nodes: z.array(TaskNodeSchema),
  created_at: z.number().int(),
});
export type TaskGraph = z.infer<typeof TaskGraphSchema>;

export const PlanProposalSchema = z.object({
  run_id: z.string(),
  goal: z.string(),
  graph: TaskGraphSchema,
  files_to_modify: z.array(z.string()),
  assumptions: z.array(z.string()).default([]),
  risks: z.array(z.string()).default([]),
  planner_model: z.string(),
  timestamp: z.number().int(),
});
export type PlanProposal = z.infer<typeof PlanProposalSchema>;

export const PlanTokenSchema = z.object({
  token: z.string(),
  run_id: z.string(),
  allowed_files: z.array(z.string()),
  issued_at: z.number().int(),
  expires_at: z.number().int(),
  scope_mode: z.enum(['explicit', 'single-model']).default('explicit'),
  scopeMode: z.enum(['explicit', 'single-model']).optional(),
  user_prompt: z.string().optional(),
});
export type PlanToken = z.infer<typeof PlanTokenSchema>;

export const DiffHunkSchema = z.object({
  oldStart: z.number().int(),
  oldLines: z.number().int(),
  newStart: z.number().int(),
  newLines: z.number().int(),
  lines: z.array(z.string()),
});
export type DiffHunk = z.infer<typeof DiffHunkSchema>;

export const FileDiffSchema = z.object({
  path: z.string(),
  oldContent: z.string().nullable(),
  newContent: z.string().nullable(),
  isNew: z.boolean(),
  isDeleted: z.boolean(),
  hunks: z.array(DiffHunkSchema),
  unifiedDiff: z.string(),
});
export type FileDiff = z.infer<typeof FileDiffSchema>;

export const DiffReviewProposalSchema = z.object({
  id: z.string(),
  run_id: z.string(),
  diffs: z.array(FileDiffSchema),
  summary: z.string(),
  timestamp: z.number().int(),
});
export type DiffReviewProposal = z.infer<typeof DiffReviewProposalSchema>;
