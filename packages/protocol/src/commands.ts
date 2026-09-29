import { z } from 'zod';
import { ProviderConfigSchema } from './domain.js';

export const SubmitPromptCommandSchema = z.object({
  type: z.literal('submitPrompt'),
  prompt: z.string().min(1),
  sessionId: z.string().optional(),
  model: z.string().optional(),
});
export type SubmitPromptCommand = z.infer<typeof SubmitPromptCommandSchema>;

export const ApprovePlanCommandSchema = z.object({
  type: z.literal('approvePlan'),
  runId: z.string().min(1),
});
export type ApprovePlanCommand = z.infer<typeof ApprovePlanCommandSchema>;

export const RejectPlanCommandSchema = z.object({
  type: z.literal('rejectPlan'),
  runId: z.string().min(1),
  reason: z.string().optional(),
});
export type RejectPlanCommand = z.infer<typeof RejectPlanCommandSchema>;

export const ApproveDiffCommandSchema = z.object({
  type: z.literal('approveDiff'),
  runId: z.string().min(1),
  hunks: z.array(z.string()).optional(),
});
export type ApproveDiffCommand = z.infer<typeof ApproveDiffCommandSchema>;

export const AnswerQuestionCommandSchema = z.object({
  type: z.literal('answerQuestion'),
  questionId: z.string().min(1),
  answer: z.string().min(1),
});
export type AnswerQuestionCommand = z.infer<typeof AnswerQuestionCommandSchema>;

export const GrantPermissionCommandSchema = z.object({
  type: z.literal('grantPermission'),
  requestId: z.string().min(1),
  allow: z.boolean(),
  alwaysForProject: z.boolean().optional(),
});
export type GrantPermissionCommand = z.infer<typeof GrantPermissionCommandSchema>;

export const CancelRunCommandSchema = z.object({
  type: z.literal('cancelRun'),
  runId: z.string().min(1),
});
export type CancelRunCommand = z.infer<typeof CancelRunCommandSchema>;

export const AddProviderCommandSchema = z.object({
  type: z.literal('addProvider'),
  provider: ProviderConfigSchema,
  apiKey: z.string().optional(),
});
export type AddProviderCommand = z.infer<typeof AddProviderCommandSchema>;

export const RefreshProvidersCommandSchema = z.object({
  type: z.literal('refreshProviders'),
});
export type RefreshProvidersCommand = z.infer<typeof RefreshProvidersCommandSchema>;

export const PinModelCommandSchema = z.object({
  type: z.literal('pinModel'),
  agentName: z.string().min(1),
  modelId: z.string().min(1),
});
export type PinModelCommand = z.infer<typeof PinModelCommandSchema>;

export const ResolvePoolExhaustedCommandSchema = z.object({
  type: z.literal('resolvePoolExhausted'),
  action: z.enum(['add_credit', 'connect_provider']),
  runId: z.string().min(1),
});
export type ResolvePoolExhaustedCommand = z.infer<typeof ResolvePoolExhaustedCommandSchema>;

/**
 * Discriminated union of all client -> engine commands.
 */
export const CommandSchema = z.discriminatedUnion('type', [
  SubmitPromptCommandSchema,
  ApprovePlanCommandSchema,
  RejectPlanCommandSchema,
  ApproveDiffCommandSchema,
  AnswerQuestionCommandSchema,
  GrantPermissionCommandSchema,
  CancelRunCommandSchema,
  AddProviderCommandSchema,
  RefreshProvidersCommandSchema,
  PinModelCommandSchema,
  ResolvePoolExhaustedCommandSchema,
]);
export type Command = z.infer<typeof CommandSchema>;
