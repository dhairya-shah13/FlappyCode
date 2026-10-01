import { z } from 'zod';
import { ProviderConfigSchema } from './config';

export const SubmitPromptCommandSchema = z.object({
  type: z.literal('submitPrompt'),
  prompt: z.string().min(1),
  model: z.string().optional(),
  session_id: z.string().optional(),
});
export type SubmitPromptCommand = z.infer<typeof SubmitPromptCommandSchema>;

export const ApprovePlanCommandSchema = z.object({
  type: z.literal('approvePlan'),
  run_id: z.string(),
});
export type ApprovePlanCommand = z.infer<typeof ApprovePlanCommandSchema>;

export const RejectPlanCommandSchema = z.object({
  type: z.literal('rejectPlan'),
  run_id: z.string(),
  reason: z.string().optional(),
});
export type RejectPlanCommand = z.infer<typeof RejectPlanCommandSchema>;

export const ApproveDiffCommandSchema = z.object({
  type: z.literal('approveDiff'),
  run_id: z.string(),
  hunk_indices: z.array(z.number()).optional(), // undefined means apply all
});
export type ApproveDiffCommand = z.infer<typeof ApproveDiffCommandSchema>;

export const RejectDiffCommandSchema = z.object({
  type: z.literal('rejectDiff'),
  run_id: z.string(),
  reason: z.string().optional(),
});
export type RejectDiffCommand = z.infer<typeof RejectDiffCommandSchema>;

export const AnswerQuestionCommandSchema = z.object({
  type: z.literal('answerQuestion'),
  question_id: z.string(),
  answer: z.string(),
});
export type AnswerQuestionCommand = z.infer<typeof AnswerQuestionCommandSchema>;

export const GrantPermissionCommandSchema = z.object({
  type: z.literal('grantPermission'),
  permission_id: z.string(),
  approved: z.boolean(),
  always_allow: z.boolean().default(false),
});
export type GrantPermissionCommand = z.infer<typeof GrantPermissionCommandSchema>;

export const CancelRunCommandSchema = z.object({
  type: z.literal('cancelRun'),
  run_id: z.string(),
});
export type CancelRunCommand = z.infer<typeof CancelRunCommandSchema>;

export const AddProviderCommandSchema = z.object({
  type: z.literal('addProvider'),
  provider: ProviderConfigSchema,
  api_key: z.string().optional(),
});
export type AddProviderCommand = z.infer<typeof AddProviderCommandSchema>;

export const RefreshProvidersCommandSchema = z.object({
  type: z.literal('refreshProviders'),
  provider_id: z.string().optional(),
});
export type RefreshProvidersCommand = z.infer<typeof RefreshProvidersCommandSchema>;

export const PinModelCommandSchema = z.object({
  type: z.literal('pinModel'),
  agent_name: z.string(),
  model_id: z.string(),
});
export type PinModelCommand = z.infer<typeof PinModelCommandSchema>;

export const ResolvePoolExhaustedCommandSchema = z.object({
  type: z.literal('resolvePoolExhausted'),
  run_id: z.string(),
  action: z.enum(['authorize_paid', 'add_free_provider', 'cancel']),
  paid_model_id: z.string().optional(),
});
export type ResolvePoolExhaustedCommand = z.infer<typeof ResolvePoolExhaustedCommandSchema>;

export const CommandSchema = z.discriminatedUnion('type', [
  SubmitPromptCommandSchema,
  ApprovePlanCommandSchema,
  RejectPlanCommandSchema,
  ApproveDiffCommandSchema,
  RejectDiffCommandSchema,
  AnswerQuestionCommandSchema,
  GrantPermissionCommandSchema,
  CancelRunCommandSchema,
  AddProviderCommandSchema,
  RefreshProvidersCommandSchema,
  PinModelCommandSchema,
  ResolvePoolExhaustedCommandSchema,
]);
export type Command = z.infer<typeof CommandSchema>;
