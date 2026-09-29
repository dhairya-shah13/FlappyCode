import { z } from 'zod';
import { TaskGraphSchema } from './domain.js';

// Base helper for events
const BaseEventFields = {
  id: z.string().min(1),
  ts: z.number().int().nonnegative(),
  sessionId: z.string().optional(),
};

export const SessionStartedEventSchema = z.object({
  ...BaseEventFields,
  type: z.literal('session.started'),
  payload: z.object({
    sessionId: z.string().min(1),
    projectPath: z.string().min(1),
  }),
});
export type SessionStartedEvent = z.infer<typeof SessionStartedEventSchema>;

export const PlanProposedEventSchema = z.object({
  ...BaseEventFields,
  type: z.literal('plan.proposed'),
  payload: z.object({
    runId: z.string().min(1),
    plan: TaskGraphSchema,
    prompt: z.string().min(1),
  }),
});
export type PlanProposedEvent = z.infer<typeof PlanProposedEventSchema>;

export const NodeStartedEventSchema = z.object({
  ...BaseEventFields,
  type: z.literal('node.started'),
  payload: z.object({
    runId: z.string().min(1),
    nodeId: z.string().min(1),
    agent: z.string().min(1),
    model: z.string().min(1),
  }),
});
export type NodeStartedEvent = z.infer<typeof NodeStartedEventSchema>;

export const NodeUpdatedEventSchema = z.object({
  ...BaseEventFields,
  type: z.literal('node.updated'),
  payload: z.object({
    runId: z.string().min(1),
    nodeId: z.string().min(1),
    status: z.string().min(1),
    delta: z.string().optional(),
    message: z.string().optional(),
  }),
});
export type NodeUpdatedEvent = z.infer<typeof NodeUpdatedEventSchema>;

export const NodeFinishedEventSchema = z.object({
  ...BaseEventFields,
  type: z.literal('node.finished'),
  payload: z.object({
    runId: z.string().min(1),
    nodeId: z.string().min(1),
    status: z.enum(['completed', 'failed', 'cancelled']),
    error: z.string().optional(),
  }),
});
export type NodeFinishedEvent = z.infer<typeof NodeFinishedEventSchema>;

export const ModelSelectedEventSchema = z.object({
  ...BaseEventFields,
  type: z.literal('model.selected'),
  payload: z.object({
    agent: z.string().min(1),
    modelId: z.string().min(1),
    providerId: z.string().min(1),
    reason: z.string().optional(),
  }),
});
export type ModelSelectedEvent = z.infer<typeof ModelSelectedEventSchema>;

export const ModelSubstitutedEventSchema = z.object({
  ...BaseEventFields,
  type: z.literal('model.substituted'),
  payload: z.object({
    agent: z.string().min(1),
    previousModelId: z.string().min(1),
    newModelId: z.string().min(1),
    reason: z.string().min(1),
  }),
});
export type ModelSubstitutedEvent = z.infer<typeof ModelSubstitutedEventSchema>;

export const DiffReadyEventSchema = z.object({
  ...BaseEventFields,
  type: z.literal('diff.ready'),
  payload: z.object({
    runId: z.string().min(1),
    diff: z.string(),
    files: z.array(z.string()).default([]),
  }),
});
export type DiffReadyEvent = z.infer<typeof DiffReadyEventSchema>;

export const ApprovalRequestedEventSchema = z.object({
  ...BaseEventFields,
  type: z.literal('approval.requested'),
  payload: z.object({
    requestId: z.string().min(1),
    kind: z.enum(['plan', 'diff', 'permission', 'pool_exhausted']),
    description: z.string().min(1),
    details: z.record(z.string(), z.unknown()).optional(),
  }),
});
export type ApprovalRequestedEvent = z.infer<typeof ApprovalRequestedEventSchema>;

export const QuestionAskedEventSchema = z.object({
  ...BaseEventFields,
  type: z.literal('question.asked'),
  payload: z.object({
    questionId: z.string().min(1),
    agent: z.string().min(1),
    question: z.string().min(1),
    options: z.array(z.string()).optional(),
  }),
});
export type QuestionAskedEvent = z.infer<typeof QuestionAskedEventSchema>;

export const PoolExhaustedEventSchema = z.object({
  ...BaseEventFields,
  type: z.literal('pool.exhausted'),
  payload: z.object({
    runId: z.string().min(1),
    message: z.string().min(1),
    resetEstimates: z.record(z.string(), z.string()).optional(),
  }),
});
export type PoolExhaustedEvent = z.infer<typeof PoolExhaustedEventSchema>;

export const ProviderStatusEventSchema = z.object({
  ...BaseEventFields,
  type: z.literal('provider.status'),
  payload: z.object({
    providerId: z.string().min(1),
    status: z.enum(['ok', 'auth_failed', 'rate_limited', 'error']),
    message: z.string().optional(),
  }),
});
export type ProviderStatusEvent = z.infer<typeof ProviderStatusEventSchema>;

export const RegistryUpdatedEventSchema = z.object({
  ...BaseEventFields,
  type: z.literal('registry.updated'),
  payload: z.object({
    totalModels: z.number().int().nonnegative(),
    freeModels: z.number().int().nonnegative(),
    rateLimitedFreeModels: z.number().int().nonnegative(),
    providersCount: z.number().int().nonnegative(),
  }),
});
export type RegistryUpdatedEvent = z.infer<typeof RegistryUpdatedEventSchema>;

export const RunCompletedEventSchema = z.object({
  ...BaseEventFields,
  type: z.literal('run.completed'),
  payload: z.object({
    runId: z.string().min(1),
    summary: z.string(),
    durationMs: z.number().int().nonnegative(),
    paidCalls: z.number().int().nonnegative().default(0),
  }),
});
export type RunCompletedEvent = z.infer<typeof RunCompletedEventSchema>;

export const RunFailedEventSchema = z.object({
  ...BaseEventFields,
  type: z.literal('run.failed'),
  payload: z.object({
    runId: z.string().min(1),
    error: z.string().min(1),
  }),
});
export type RunFailedEvent = z.infer<typeof RunFailedEventSchema>;

export const LogEventSchema = z.object({
  ...BaseEventFields,
  type: z.literal('log'),
  payload: z.object({
    level: z.enum(['debug', 'info', 'warn', 'error']),
    message: z.string(),
    meta: z.record(z.string(), z.unknown()).optional(),
  }),
});
export type LogEvent = z.infer<typeof LogEventSchema>;

/**
 * Discriminated union of all engine -> client events.
 */
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
  RunCompletedEventSchema,
  RunFailedEventSchema,
  LogEventSchema,
]);
export type FlappyEvent = z.infer<typeof FlappyEventSchema>;
