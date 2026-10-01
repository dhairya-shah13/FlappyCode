import { z } from 'zod';
import { PlanProposalSchema, DiffReviewProposalSchema, TaskNodeSchema } from './tasks';
import { ModelSchema } from './models';

export const SessionStartedEventSchema = z.object({
  type: z.literal('session.started'),
  session_id: z.string(),
  project_path: z.string(),
  timestamp: z.number().int(),
});
export type SessionStartedEvent = z.infer<typeof SessionStartedEventSchema>;

export const PlanProposedEventSchema = z.object({
  type: z.literal('plan.proposed'),
  plan: PlanProposalSchema,
  timestamp: z.number().int(),
});
export type PlanProposedEvent = z.infer<typeof PlanProposedEventSchema>;

export const NodeStartedEventSchema = z.object({
  type: z.literal('node.started'),
  run_id: z.string(),
  node: TaskNodeSchema,
  timestamp: z.number().int(),
});
export type NodeStartedEvent = z.infer<typeof NodeStartedEventSchema>;

export const NodeUpdatedEventSchema = z.object({
  type: z.literal('node.updated'),
  run_id: z.string(),
  node: TaskNodeSchema,
  delta: z.string().optional(),
  timestamp: z.number().int(),
});
export type NodeUpdatedEvent = z.infer<typeof NodeUpdatedEventSchema>;

export const NodeFinishedEventSchema = z.object({
  type: z.literal('node.finished'),
  run_id: z.string(),
  node: TaskNodeSchema,
  timestamp: z.number().int(),
});
export type NodeFinishedEvent = z.infer<typeof NodeFinishedEventSchema>;

export const ModelSelectedEventSchema = z.object({
  type: z.literal('model.selected'),
  run_id: z.string(),
  node_id: z.string(),
  agent: z.string(),
  model: ModelSchema,
  is_pinned: z.boolean(),
  timestamp: z.number().int(),
});
export type ModelSelectedEvent = z.infer<typeof ModelSelectedEventSchema>;

export const ModelSubstitutedEventSchema = z.object({
  type: z.literal('model.substituted'),
  run_id: z.string(),
  node_id: z.string(),
  agent: z.string(),
  original_model_id: z.string(),
  substituted_model_id: z.string(),
  reason: z.string(),
  timestamp: z.number().int(),
});
export type ModelSubstitutedEvent = z.infer<typeof ModelSubstitutedEventSchema>;

export const DiffReadyEventSchema = z.object({
  type: z.literal('diff.ready'),
  proposal: DiffReviewProposalSchema,
  timestamp: z.number().int(),
});
export type DiffReadyEvent = z.infer<typeof DiffReadyEventSchema>;

export const ApprovalRequestedEventSchema = z.object({
  type: z.literal('approval.requested'),
  approval_id: z.string(),
  run_id: z.string(),
  kind: z.enum(['plan', 'diff', 'permission', 'destructive', 'pool_exhausted']),
  title: z.string(),
  description: z.string(),
  details: z.record(z.any()).optional(),
  timestamp: z.number().int(),
});
export type ApprovalRequestedEvent = z.infer<typeof ApprovalRequestedEventSchema>;

export const QuestionAskedEventSchema = z.object({
  type: z.literal('question.asked'),
  question_id: z.string(),
  run_id: z.string(),
  agent: z.string(),
  question: z.string(),
  options: z.array(z.string()).optional(),
  timestamp: z.number().int(),
});
export type QuestionAskedEvent = z.infer<typeof QuestionAskedEventSchema>;

export const PoolExhaustedEventSchema = z.object({
  type: z.literal('pool.exhausted'),
  run_id: z.string(),
  task_requirements: z.record(z.any()),
  message: z.string(),
  next_reset_estimate: z.record(z.string()).optional(),
  timestamp: z.number().int(),
});
export type PoolExhaustedEvent = z.infer<typeof PoolExhaustedEventSchema>;

export const ProviderStatusEventSchema = z.object({
  type: z.literal('provider.status'),
  provider_id: z.string(),
  status: z.enum(['healthy', 'rate_limited', 'auth_failed', 'offline']),
  latency_ms: z.number().int().optional(),
  error: z.string().optional(),
  timestamp: z.number().int(),
});
export type ProviderStatusEvent = z.infer<typeof ProviderStatusEventSchema>;

export const RegistryUpdatedEventSchema = z.object({
  type: z.literal('registry.updated'),
  total_models: z.number().int().nonnegative(),
  free_models: z.number().int().nonnegative(),
  rate_limited_free_models: z.number().int().nonnegative(),
  paid_models: z.number().int().nonnegative(),
  connected_providers: z.number().int().nonnegative(),
  timestamp: z.number().int(),
});
export type RegistryUpdatedEvent = z.infer<typeof RegistryUpdatedEventSchema>;

export const RunStartedEventSchema = z.object({
  type: z.literal('run.started'),
  run_id: z.string(),
  prompt: z.string(),
  timestamp: z.number().int(),
});
export type RunStartedEvent = z.infer<typeof RunStartedEventSchema>;

export const RunCompletedEventSchema = z.object({
  type: z.literal('run.completed'),
  run_id: z.string(),
  duration_ms: z.number().int().nonnegative(),
  nodes_completed: z.number().int().nonnegative(),
  models_used: z.array(z.string()),
  paid_calls: z.number().int().nonnegative().default(0),
  files_changed: z.array(z.string()).default([]),
  summary: z.string(),
  timestamp: z.number().int(),
});
export type RunCompletedEvent = z.infer<typeof RunCompletedEventSchema>;

export const RunFailedEventSchema = z.object({
  type: z.literal('run.failed'),
  run_id: z.string(),
  error: z.string(),
  reason: z.string().optional(),
  timestamp: z.number().int(),
});
export type RunFailedEvent = z.infer<typeof RunFailedEventSchema>;

export const LogEventSchema = z.object({
  type: z.literal('log'),
  level: z.enum(['debug', 'info', 'warn', 'error']),
  message: z.string(),
  context: z.record(z.any()).optional(),
  timestamp: z.number().int(),
});
export type LogEvent = z.infer<typeof LogEventSchema>;

export const FlappyEventSchema = z.discriminatedUnion('type', [
  SessionStartedEventSchema,
  PlanProposedEventSchema,
  NodeStartedEventSchema,
  NodeUpdatedEventSchema,
  NodeFinishedEventSchema,
  ModelSelectedEventSchema,
  ModelSubstitutedEventSchema,
  DiffReadyEventSchema,
  ApprovalRequestedEventSchema,
  QuestionAskedEventSchema,
  PoolExhaustedEventSchema,
  ProviderStatusEventSchema,
  RegistryUpdatedEventSchema,
  RunStartedEventSchema,
  RunCompletedEventSchema,
  RunFailedEventSchema,
  LogEventSchema,
]);
export type FlappyEvent = z.infer<typeof FlappyEventSchema>;
